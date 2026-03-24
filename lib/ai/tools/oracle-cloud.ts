/**
 * lib/ai/tools/oracle-cloud.ts
 *
 * Oracle Cloud Infrastructure (OCI) integration for Etles.
 * Exposes Compute, Networking, Object Storage, Identity, Database,
 * Container Engine (OKE), Load Balancer, Monitoring, and DNS
 * as AI tools — following the same pattern as daytona.ts.
 *
 * Install:
 *   pnpm install oci-common oci-core oci-objectstorage oci-identity \
 *               oci-database oci-containerengine oci-loadbalancer \
 *               oci-monitoring oci-dns oci-filestorage
 *
 * Required env vars:
 *   OCI_TENANCY_OCID       — e.g. ocid1.tenancy.oc1..xxxx
 *   OCI_USER_OCID          — e.g. ocid1.user.oc1..xxxx
 *   OCI_FINGERPRINT        — API key fingerprint
 *   OCI_PRIVATE_KEY        — PEM private key (full content, \n for newlines)
 *   OCI_REGION             — e.g. us-ashburn-1, eu-frankfurt-1
 *   OCI_COMPARTMENT_ID     — default compartment OCID for operations
 *
 * Optional:
 *   OCI_PRIVATE_KEY_PASSPHRASE — if your private key is encrypted
 */

import { tool } from "ai";
import * as common from "oci-common";
import * as core from "oci-core";
import * as objectstorage from "oci-objectstorage";
import * as identity from "oci-identity";
import * as database from "oci-database";
import * as containerengine from "oci-containerengine";
import * as loadbalancer from "oci-loadbalancer";
import * as monitoring from "oci-monitoring";
import * as dns from "oci-dns";
import { z } from "zod";
import { Readable } from "stream";

// ── Auth Provider ─────────────────────────────────────────────────────────────
// Re-use one provider per process. Built from env vars so no config file needed
// in server environments.

let _provider: common.SimpleAuthenticationDetailsProvider | null = null;

function getProvider(): common.SimpleAuthenticationDetailsProvider {
  if (_provider) return _provider;

  const tenancy = process.env.OCI_TENANCY_OCID!;
  const user = process.env.OCI_USER_OCID!;
  const fingerprint = process.env.OCI_FINGERPRINT!;
  const privateKey = process.env.OCI_PRIVATE_KEY!.replace(/\\n/g, "\n");
  const passphrase = process.env.OCI_PRIVATE_KEY_PASSPHRASE ?? null;
  const region = process.env.OCI_REGION ?? "us-ashburn-1";

  _provider = new common.SimpleAuthenticationDetailsProvider(
    tenancy,
    user,
    fingerprint,
    privateKey,
    passphrase,
    common.Region.fromRegionId(region)
  );

  return _provider;
}

/** Default compartment from env — most tools accept an optional override. */
function defaultCompartment(): string {
  return process.env.OCI_COMPARTMENT_ID ?? "";
}

// ── Client Factories ──────────────────────────────────────────────────────────
// Each returns a fresh client (cheap; no pooling needed for server-side tools).

function computeClient() {
  return new core.ComputeClient({ authenticationDetailsProvider: getProvider() });
}

function networkClient() {
  return new core.VirtualNetworkClient({ authenticationDetailsProvider: getProvider() });
}

function objectStorageClient() {
  return new objectstorage.ObjectStorageClient({
    authenticationDetailsProvider: getProvider(),
  });
}

function identityClient() {
  return new identity.IdentityClient({ authenticationDetailsProvider: getProvider() });
}

function databaseClient() {
  return new database.DatabaseClient({ authenticationDetailsProvider: getProvider() });
}

function containerEngineClient() {
  return new containerengine.ContainerEngineClient({
    authenticationDetailsProvider: getProvider(),
  });
}

function loadBalancerClient() {
  return new loadbalancer.LoadBalancerClient({
    authenticationDetailsProvider: getProvider(),
  });
}

function monitoringClient() {
  return new monitoring.MonitoringClient({
    authenticationDetailsProvider: getProvider(),
  });
}

function dnsClient() {
  return new dns.DnsClient({ authenticationDetailsProvider: getProvider() });
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function comp(override?: string): string {
  return override ?? defaultCompartment();
}

async function streamToString(stream: NodeJS.ReadableStream): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf-8");
}

// =============================================================================
// IDENTITY & COMPARTMENTS
// =============================================================================

/**
 * listCompartments — List all compartments in the tenancy.
 */
export const listCompartments = () =>
  tool({
    description:
      "List all OCI compartments in the tenancy. " +
      "Use to discover available compartments before creating resources. " +
      "Returns compartment OCIDs, names, and lifecycle state.",
    inputSchema: z.object({
      compartmentId: z
        .string()
        .optional()
        .describe("Parent compartment OCID. Defaults to tenancy root."),
      lifecycleState: z
        .enum(["ACTIVE", "DELETING", "DELETED", "CREATING"])
        .optional()
        .default("ACTIVE")
        .describe("Filter by lifecycle state. Default: ACTIVE."),
    }),
    execute: async ({ compartmentId, lifecycleState }) => {
      try {
        const client = identityClient();
        const root = compartmentId ?? process.env.OCI_TENANCY_OCID!;
        const response = await client.listCompartments({
          compartmentId: root,
          compartmentIdInSubtree: true,
          lifecycleState: (lifecycleState as any) ?? "ACTIVE",
        });
        return {
          success: true,
          compartments: response.items.map((c) => ({
            id: c.id,
            name: c.name,
            description: c.description,
            lifecycleState: c.lifecycleState,
          })),
        };
      } catch (error: any) {
        return { success: false, error: error?.message ?? String(error) };
      }
    },
  });

/**
 * listAvailabilityDomains — List ADs in the region.
 */
export const listAvailabilityDomains = () =>
  tool({
    description:
      "List all Availability Domains in the current OCI region. " +
      "Needed when launching compute instances or creating subnets.",
    inputSchema: z.object({
      compartmentId: z.string().optional().describe("Compartment OCID. Defaults to env default."),
    }),
    execute: async ({ compartmentId }) => {
      try {
        const client = identityClient();
        const response = await client.listAvailabilityDomains({
          compartmentId: comp(compartmentId),
        });
        return {
          success: true,
          availabilityDomains: response.items.map((ad) => ({
            name: ad.name,
            id: ad.id,
          })),
        };
      } catch (error: any) {
        return { success: false, error: error?.message ?? String(error) };
      }
    },
  });

/**
 * listUsers — List IAM users.
 */
export const listUsers = () =>
  tool({
    description: "List IAM users in a compartment.",
    inputSchema: z.object({
      compartmentId: z.string().optional().describe("Compartment OCID."),
    }),
    execute: async ({ compartmentId }) => {
      try {
        const client = identityClient();
        const response = await client.listUsers({ compartmentId: comp(compartmentId) });
        return {
          success: true,
          users: response.items.map((u) => ({
            id: u.id,
            name: u.name,
            email: u.email,
            lifecycleState: u.lifecycleState,
            isMfaActivated: u.isMfaActivated,
          })),
        };
      } catch (error: any) {
        return { success: false, error: error?.message ?? String(error) };
      }
    },
  });

/**
 * listGroups — List IAM groups.
 */
export const listGroups = () =>
  tool({
    description: "List IAM groups in a compartment.",
    inputSchema: z.object({
      compartmentId: z.string().optional().describe("Compartment OCID."),
    }),
    execute: async ({ compartmentId }) => {
      try {
        const client = identityClient();
        const response = await client.listGroups({ compartmentId: comp(compartmentId) });
        return {
          success: true,
          groups: response.items.map((g) => ({
            id: g.id,
            name: g.name,
            description: g.description,
            lifecycleState: g.lifecycleState,
          })),
        };
      } catch (error: any) {
        return { success: false, error: error?.message ?? String(error) };
      }
    },
  });

/**
 * listPolicies — List IAM policies.
 */
export const listPolicies = () =>
  tool({
    description: "List IAM policies in a compartment.",
    inputSchema: z.object({
      compartmentId: z.string().optional().describe("Compartment OCID."),
    }),
    execute: async ({ compartmentId }) => {
      try {
        const client = identityClient();
        const response = await client.listPolicies({ compartmentId: comp(compartmentId) });
        return {
          success: true,
          policies: response.items.map((p) => ({
            id: p.id,
            name: p.name,
            statements: p.statements,
            lifecycleState: p.lifecycleState,
          })),
        };
      } catch (error: any) {
        return { success: false, error: error?.message ?? String(error) };
      }
    },
  });

// =============================================================================
// COMPUTE
// =============================================================================

/**
 * listInstances — List compute instances in a compartment.
 */
export const listInstances = () =>
  tool({
    description:
      "List all compute instances in an OCI compartment. " +
      "Returns instance OCIDs, display names, shapes, lifecycle states, and IP addresses.",
    inputSchema: z.object({
      compartmentId: z.string().optional().describe("Compartment OCID. Defaults to env default."),
      lifecycleState: z
        .enum(["RUNNING", "STOPPED", "STARTING", "STOPPING", "TERMINATED", "PROVISIONING"])
        .optional()
        .describe("Filter by lifecycle state."),
    }),
    execute: async ({ compartmentId, lifecycleState }) => {
      try {
        const client = computeClient();
        const response = await client.listInstances({
          compartmentId: comp(compartmentId),
          lifecycleState: lifecycleState as any,
        });
        return {
          success: true,
          instances: response.items.map((i) => ({
            id: i.id,
            displayName: i.displayName,
            shape: i.shape,
            lifecycleState: i.lifecycleState,
            availabilityDomain: i.availabilityDomain,
            region: i.region,
            timeCreated: i.timeCreated,
            faultDomain: i.faultDomain,
            shapeConfig: i.shapeConfig
              ? {
                  ocpus: i.shapeConfig.ocpus,
                  memoryInGBs: i.shapeConfig.memoryInGBs,
                }
              : undefined,
          })),
        };
      } catch (error: any) {
        return { success: false, error: error?.message ?? String(error) };
      }
    },
  });

/**
 * getInstance — Get details of a specific compute instance.
 */
export const getInstance = () =>
  tool({
    description: "Get detailed information about a specific OCI compute instance by OCID.",
    inputSchema: z.object({
      instanceId: z.string().describe("Instance OCID."),
    }),
    execute: async ({ instanceId }) => {
      try {
        const client = computeClient();
        const response = await client.getInstance({ instanceId });
        const i = response.instance;
        return {
          success: true,
          instance: {
            id: i.id,
            displayName: i.displayName,
            shape: i.shape,
            lifecycleState: i.lifecycleState,
            availabilityDomain: i.availabilityDomain,
            region: i.region,
            timeCreated: i.timeCreated,
            faultDomain: i.faultDomain,
            imageId: i.imageId,
            metadata: i.metadata,
            freeformTags: i.freeformTags,
            shapeConfig: i.shapeConfig,
          },
        };
      } catch (error: any) {
        return { success: false, error: error?.message ?? String(error) };
      }
    },
  });

/**
 * launchInstance — Create a new compute instance.
 */
export const launchInstance = () =>
  tool({
    description:
      "Launch a new OCI compute instance. " +
      "Requires: compartmentId, availabilityDomain (from listAvailabilityDomains), " +
      "shape (e.g. VM.Standard.E4.Flex), imageId, subnetId. " +
      "For Flex shapes, specify ocpus and memoryInGBs.",
    inputSchema: z.object({
      compartmentId: z.string().optional().describe("Compartment OCID."),
      displayName: z.string().describe("Display name for the instance."),
      availabilityDomain: z.string().describe("Availability Domain name. E.g. 'GrCH:US-ASHBURN-AD-1'."),
      shape: z
        .string()
        .default("VM.Standard.E4.Flex")
        .describe("Instance shape. E.g. VM.Standard.E4.Flex, VM.Standard.A1.Flex."),
      imageId: z.string().describe("OS image OCID."),
      subnetId: z.string().describe("Subnet OCID for the primary VNIC."),
      ocpus: z
        .number()
        .optional()
        .default(1)
        .describe("CPUs for Flex shapes. Default: 1."),
      memoryInGBs: z
        .number()
        .optional()
        .default(8)
        .describe("RAM in GB for Flex shapes. Default: 8."),
      sshPublicKey: z.string().optional().describe("SSH public key for instance access."),
      assignPublicIp: z
        .boolean()
        .optional()
        .default(true)
        .describe("Assign a public IP to the primary VNIC. Default: true."),
      userData: z
        .string()
        .optional()
        .describe("Cloud-init user data script (base64-encoded)."),
      freeformTags: z
        .record(z.string())
        .optional()
        .describe("Freeform tags as key-value pairs."),
    }),
    execute: async ({
      compartmentId,
      displayName,
      availabilityDomain,
      shape,
      imageId,
      subnetId,
      ocpus,
      memoryInGBs,
      sshPublicKey,
      assignPublicIp,
      userData,
      freeformTags,
    }) => {
      try {
        const client = computeClient();
        const launchDetails: core.models.LaunchInstanceDetails = {
          compartmentId: comp(compartmentId),
          displayName,
          availabilityDomain,
          shape,
          sourceDetails: {
            sourceType: "image",
            imageId,
          } as core.models.InstanceSourceViaImageDetails,
          createVnicDetails: {
            subnetId,
            assignPublicIp: assignPublicIp ?? true,
          },
          shapeConfig: shape.includes("Flex")
            ? { ocpus: ocpus ?? 1, memoryInGBs: memoryInGBs ?? 8 }
            : undefined,
          metadata: {
            ...(sshPublicKey ? { ssh_authorized_keys: sshPublicKey } : {}),
            ...(userData ? { user_data: userData } : {}),
          },
          freeformTags,
        };

        const response = await client.launchInstance({ launchInstanceDetails: launchDetails });
        const i = response.instance;
        return {
          success: true,
          instanceId: i.id,
          displayName: i.displayName,
          lifecycleState: i.lifecycleState,
          shape: i.shape,
          message: `Instance '${i.displayName}' (${i.id}) is ${i.lifecycleState}.`,
        };
      } catch (error: any) {
        return { success: false, error: error?.message ?? String(error) };
      }
    },
  });

/**
 * instanceAction — Start, stop, soft reset, or reset an instance.
 */
export const instanceAction = () =>
  tool({
    description:
      "Perform a power action on an OCI compute instance. " +
      "Actions: START, STOP, SOFTSTOP, SOFTRESET, RESET (hard reboot).",
    inputSchema: z.object({
      instanceId: z.string().describe("Instance OCID."),
      action: z
        .enum(["START", "STOP", "SOFTSTOP", "SOFTRESET", "RESET"])
        .describe("Power action to perform."),
    }),
    execute: async ({ instanceId, action }) => {
      try {
        const client = computeClient();
        const response = await client.instanceAction({ instanceId, action });
        const i = response.instance;
        return {
          success: true,
          instanceId: i.id,
          displayName: i.displayName,
          lifecycleState: i.lifecycleState,
          message: `Action '${action}' applied to instance ${i.id}. State: ${i.lifecycleState}.`,
        };
      } catch (error: any) {
        return { success: false, error: error?.message ?? String(error) };
      }
    },
  });

/**
 * terminateInstance — Permanently delete a compute instance.
 */
export const terminateInstance = () =>
  tool({
    description:
      "Permanently terminate (delete) an OCI compute instance. " +
      "This is irreversible. Set preserveBootVolume=true to keep the boot disk.",
    inputSchema: z.object({
      instanceId: z.string().describe("Instance OCID to terminate."),
      preserveBootVolume: z
        .boolean()
        .optional()
        .default(false)
        .describe("Keep the boot volume after termination. Default: false."),
    }),
    execute: async ({ instanceId, preserveBootVolume }) => {
      try {
        const client = computeClient();
        await client.terminateInstance({ instanceId, preserveBootVolume: preserveBootVolume ?? false });
        return { success: true, message: `Instance ${instanceId} termination initiated.` };
      } catch (error: any) {
        return { success: false, error: error?.message ?? String(error) };
      }
    },
  });

/**
 * listShapes — List available compute shapes in a compartment.
 */
export const listShapes = () =>
  tool({
    description:
      "List available compute shapes (VM/BM sizes) in an OCI compartment. " +
      "Use to find valid shape names before launching an instance.",
    inputSchema: z.object({
      compartmentId: z.string().optional().describe("Compartment OCID."),
    }),
    execute: async ({ compartmentId }) => {
      try {
        const client = computeClient();
        const response = await client.listShapes({ compartmentId: comp(compartmentId) });
        return {
          success: true,
          shapes: response.items.map((s) => ({
            shape: s.shape,
            ocpus: s.ocpus,
            memoryInGBs: s.memoryInGBs,
            isFlexible: s.isFlexible,
            processorDescription: s.processorDescription,
          })),
        };
      } catch (error: any) {
        return { success: false, error: error?.message ?? String(error) };
      }
    },
  });

/**
 * listImages — List available OS images.
 */
export const listImages = () =>
  tool({
    description:
      "List available OS images for compute instances. " +
      "Filter by operating system (e.g. 'Oracle Linux', 'Ubuntu') or shape.",
    inputSchema: z.object({
      compartmentId: z.string().optional().describe("Compartment OCID."),
      operatingSystem: z
        .string()
        .optional()
        .describe("Filter by OS name. E.g. 'Oracle Linux', 'Ubuntu', 'Windows'."),
      shape: z
        .string()
        .optional()
        .describe("Filter images compatible with this shape."),
    }),
    execute: async ({ compartmentId, operatingSystem, shape }) => {
      try {
        const client = computeClient();
        const response = await client.listImages({
          compartmentId: comp(compartmentId),
          operatingSystem,
          shape,
        });
        return {
          success: true,
          images: response.items.map((img) => ({
            id: img.id,
            displayName: img.displayName,
            operatingSystem: img.operatingSystem,
            operatingSystemVersion: img.operatingSystemVersion,
            lifecycleState: img.lifecycleState,
            timeCreated: img.timeCreated,
          })),
        };
      } catch (error: any) {
        return { success: false, error: error?.message ?? String(error) };
      }
    },
  });

/**
 * listVnicAttachments — Get VNIC info (IPs) for an instance.
 */
export const listVnicAttachments = () =>
  tool({
    description:
      "List VNIC attachments for a compute instance to retrieve its private and public IP addresses.",
    inputSchema: z.object({
      compartmentId: z.string().optional().describe("Compartment OCID."),
      instanceId: z.string().describe("Instance OCID."),
    }),
    execute: async ({ compartmentId, instanceId }) => {
      try {
        const computeC = computeClient();
        const netC = networkClient();

        const vnicsResp = await computeC.listVnicAttachments({
          compartmentId: comp(compartmentId),
          instanceId,
        });

        const results = await Promise.all(
          vnicsResp.items.map(async (att) => {
            if (!att.vnicId) return { attachmentId: att.id };
            try {
              const vnicResp = await netC.getVnic({ vnicId: att.vnicId });
              return {
                attachmentId: att.id,
                vnicId: att.vnicId,
                privateIp: vnicResp.vnic.privateIp,
                publicIp: vnicResp.vnic.publicIp,
                hostname: vnicResp.vnic.hostnameLabel,
                isPrimary: vnicResp.vnic.isPrimary,
              };
            } catch {
              return { attachmentId: att.id, vnicId: att.vnicId };
            }
          })
        );

        return { success: true, vnics: results };
      } catch (error: any) {
        return { success: false, error: error?.message ?? String(error) };
      }
    },
  });

// =============================================================================
// NETWORKING (VCN)
// =============================================================================

/**
 * listVcns — List Virtual Cloud Networks.
 */
export const listVcns = () =>
  tool({
    description:
      "List all Virtual Cloud Networks (VCNs) in a compartment. " +
      "Returns OCID, display name, CIDR block, and lifecycle state.",
    inputSchema: z.object({
      compartmentId: z.string().optional().describe("Compartment OCID."),
    }),
    execute: async ({ compartmentId }) => {
      try {
        const client = networkClient();
        const response = await client.listVcns({ compartmentId: comp(compartmentId) });
        return {
          success: true,
          vcns: response.items.map((v) => ({
            id: v.id,
            displayName: v.displayName,
            cidrBlock: v.cidrBlock,
            cidrBlocks: v.cidrBlocks,
            lifecycleState: v.lifecycleState,
            dnsLabel: v.dnsLabel,
            defaultDhcpOptionsId: v.defaultDhcpOptionsId,
            defaultSecurityListId: v.defaultSecurityListId,
            defaultRouteTableId: v.defaultRouteTableId,
          })),
        };
      } catch (error: any) {
        return { success: false, error: error?.message ?? String(error) };
      }
    },
  });

/**
 * createVcn — Create a new VCN.
 */
export const createVcn = () =>
  tool({
    description: "Create a new Virtual Cloud Network (VCN) in OCI.",
    inputSchema: z.object({
      compartmentId: z.string().optional().describe("Compartment OCID."),
      displayName: z.string().describe("Display name for the VCN."),
      cidrBlock: z
        .string()
        .default("10.0.0.0/16")
        .describe("CIDR block for the VCN. E.g. '10.0.0.0/16'."),
      dnsLabel: z
        .string()
        .optional()
        .describe("DNS label (no spaces, max 15 chars). E.g. 'myvcn'."),
    }),
    execute: async ({ compartmentId, displayName, cidrBlock, dnsLabel }) => {
      try {
        const client = networkClient();
        const response = await client.createVcn({
          createVcnDetails: {
            compartmentId: comp(compartmentId),
            displayName,
            cidrBlock,
            dnsLabel,
          },
        });
        const v = response.vcn;
        return {
          success: true,
          vcnId: v.id,
          displayName: v.displayName,
          cidrBlock: v.cidrBlock,
          lifecycleState: v.lifecycleState,
          message: `VCN '${v.displayName}' created (${v.id}).`,
        };
      } catch (error: any) {
        return { success: false, error: error?.message ?? String(error) };
      }
    },
  });

/**
 * deleteVcn — Delete a VCN (must be empty).
 */
export const deleteVcn = () =>
  tool({
    description:
      "Delete a VCN. The VCN must have no subnets or other resources before deletion.",
    inputSchema: z.object({
      vcnId: z.string().describe("VCN OCID to delete."),
    }),
    execute: async ({ vcnId }) => {
      try {
        const client = networkClient();
        await client.deleteVcn({ vcnId });
        return { success: true, message: `VCN ${vcnId} deletion initiated.` };
      } catch (error: any) {
        return { success: false, error: error?.message ?? String(error) };
      }
    },
  });

/**
 * listSubnets — List subnets in a VCN or compartment.
 */
export const listSubnets = () =>
  tool({
    description: "List subnets in a compartment, optionally filtered by VCN.",
    inputSchema: z.object({
      compartmentId: z.string().optional().describe("Compartment OCID."),
      vcnId: z.string().optional().describe("Filter subnets belonging to this VCN."),
    }),
    execute: async ({ compartmentId, vcnId }) => {
      try {
        const client = networkClient();
        const response = await client.listSubnets({
          compartmentId: comp(compartmentId),
          vcnId,
        });
        return {
          success: true,
          subnets: response.items.map((s) => ({
            id: s.id,
            displayName: s.displayName,
            cidrBlock: s.cidrBlock,
            availabilityDomain: s.availabilityDomain,
            lifecycleState: s.lifecycleState,
            prohibitPublicIpOnVnic: s.prohibitPublicIpOnVnic,
            dnsLabel: s.dnsLabel,
          })),
        };
      } catch (error: any) {
        return { success: false, error: error?.message ?? String(error) };
      }
    },
  });

/**
 * createSubnet — Create a subnet inside a VCN.
 */
export const createSubnet = () =>
  tool({
    description:
      "Create a subnet inside a VCN. Provide the VCN OCID, CIDR block, and availability domain.",
    inputSchema: z.object({
      compartmentId: z.string().optional().describe("Compartment OCID."),
      vcnId: z.string().describe("VCN OCID."),
      displayName: z.string().describe("Subnet display name."),
      cidrBlock: z.string().describe("Subnet CIDR. E.g. '10.0.1.0/24'."),
      availabilityDomain: z
        .string()
        .optional()
        .describe("AD name for regional subnets (omit for regional subnet)."),
      dnsLabel: z.string().optional().describe("DNS label for the subnet."),
      prohibitPublicIpOnVnic: z
        .boolean()
        .optional()
        .default(false)
        .describe("If true, instances in this subnet won't get public IPs."),
    }),
    execute: async ({
      compartmentId,
      vcnId,
      displayName,
      cidrBlock,
      availabilityDomain,
      dnsLabel,
      prohibitPublicIpOnVnic,
    }) => {
      try {
        const client = networkClient();
        const response = await client.createSubnet({
          createSubnetDetails: {
            compartmentId: comp(compartmentId),
            vcnId,
            displayName,
            cidrBlock,
            availabilityDomain,
            dnsLabel,
            prohibitPublicIpOnVnic: prohibitPublicIpOnVnic ?? false,
          },
        });
        const s = response.subnet;
        return {
          success: true,
          subnetId: s.id,
          displayName: s.displayName,
          cidrBlock: s.cidrBlock,
          lifecycleState: s.lifecycleState,
          message: `Subnet '${s.displayName}' created (${s.id}).`,
        };
      } catch (error: any) {
        return { success: false, error: error?.message ?? String(error) };
      }
    },
  });

/**
 * deleteSubnet — Delete a subnet.
 */
export const deleteSubnet = () =>
  tool({
    description: "Delete a subnet from a VCN. The subnet must be empty.",
    inputSchema: z.object({
      subnetId: z.string().describe("Subnet OCID."),
    }),
    execute: async ({ subnetId }) => {
      try {
        const client = networkClient();
        await client.deleteSubnet({ subnetId });
        return { success: true, message: `Subnet ${subnetId} deletion initiated.` };
      } catch (error: any) {
        return { success: false, error: error?.message ?? String(error) };
      }
    },
  });

/**
 * listSecurityLists — List security list rules for a VCN.
 */
export const listSecurityLists = () =>
  tool({
    description: "List security lists (firewall rules) in a compartment, optionally filtered by VCN.",
    inputSchema: z.object({
      compartmentId: z.string().optional().describe("Compartment OCID."),
      vcnId: z.string().optional().describe("VCN OCID to filter by."),
    }),
    execute: async ({ compartmentId, vcnId }) => {
      try {
        const client = networkClient();
        const response = await client.listSecurityLists({
          compartmentId: comp(compartmentId),
          vcnId,
        });
        return {
          success: true,
          securityLists: response.items.map((sl) => ({
            id: sl.id,
            displayName: sl.displayName,
            lifecycleState: sl.lifecycleState,
            ingressSecurityRules: sl.ingressSecurityRules?.length ?? 0,
            egressSecurityRules: sl.egressSecurityRules?.length ?? 0,
          })),
        };
      } catch (error: any) {
        return { success: false, error: error?.message ?? String(error) };
      }
    },
  });

/**
 * listInternetGateways — List internet gateways in a VCN.
 */
export const listInternetGateways = () =>
  tool({
    description: "List internet gateways in a VCN compartment.",
    inputSchema: z.object({
      compartmentId: z.string().optional().describe("Compartment OCID."),
      vcnId: z.string().optional().describe("VCN OCID."),
    }),
    execute: async ({ compartmentId, vcnId }) => {
      try {
        const client = networkClient();
        const response = await client.listInternetGateways({
          compartmentId: comp(compartmentId),
          vcnId,
        });
        return {
          success: true,
          internetGateways: response.items.map((ig) => ({
            id: ig.id,
            displayName: ig.displayName,
            isEnabled: ig.isEnabled,
            lifecycleState: ig.lifecycleState,
          })),
        };
      } catch (error: any) {
        return { success: false, error: error?.message ?? String(error) };
      }
    },
  });

// =============================================================================
// OBJECT STORAGE
// =============================================================================

/**
 * getObjectStorageNamespace — Get the tenancy's Object Storage namespace.
 */
export const getObjectStorageNamespace = () =>
  tool({
    description:
      "Get the Object Storage namespace for the tenancy. " +
      "Required as a parameter for all Object Storage operations.",
    inputSchema: z.object({}),
    execute: async () => {
      try {
        const client = objectStorageClient();
        const response = await client.getNamespace({});
        return { success: true, namespace: response.value };
      } catch (error: any) {
        return { success: false, error: error?.message ?? String(error) };
      }
    },
  });

/**
 * listBuckets — List Object Storage buckets.
 */
export const listBuckets = () =>
  tool({
    description: "List all Object Storage buckets in a compartment and namespace.",
    inputSchema: z.object({
      namespaceName: z.string().describe("Object Storage namespace (from getObjectStorageNamespace)."),
      compartmentId: z.string().optional().describe("Compartment OCID."),
    }),
    execute: async ({ namespaceName, compartmentId }) => {
      try {
        const client = objectStorageClient();
        const response = await client.listBuckets({
          namespaceName,
          compartmentId: comp(compartmentId),
        });
        return {
          success: true,
          buckets: response.items.map((b) => ({
            name: b.name,
            namespace: b.namespace,
            compartmentId: b.compartmentId,
            createdBy: b.createdBy,
            timeCreated: b.timeCreated,
            etag: b.etag,
          })),
        };
      } catch (error: any) {
        return { success: false, error: error?.message ?? String(error) };
      }
    },
  });

/**
 * createBucket — Create an Object Storage bucket.
 */
export const createBucket = () =>
  tool({
    description:
      "Create a new Object Storage bucket. Bucket names must be unique within a namespace.",
    inputSchema: z.object({
      namespaceName: z.string().describe("Object Storage namespace."),
      compartmentId: z.string().optional().describe("Compartment OCID."),
      bucketName: z.string().describe("Bucket name (unique within namespace)."),
      publicAccessType: z
        .enum(["NoPublicAccess", "ObjectRead", "ObjectReadWithoutList"])
        .optional()
        .default("NoPublicAccess")
        .describe("Public access level. Default: NoPublicAccess."),
      versioning: z
        .enum(["Enabled", "Disabled"])
        .optional()
        .default("Disabled")
        .describe("Object versioning. Default: Disabled."),
      storageTier: z
        .enum(["Standard", "Archive", "IntelligentTiering"])
        .optional()
        .default("Standard")
        .describe("Storage tier. Default: Standard."),
    }),
    execute: async ({
      namespaceName,
      compartmentId,
      bucketName,
      publicAccessType,
      versioning,
      storageTier,
    }) => {
      try {
        const client = objectStorageClient();
        const response = await client.createBucket({
          namespaceName,
          createBucketDetails: {
            name: bucketName,
            compartmentId: comp(compartmentId),
            publicAccessType: publicAccessType as any,
            versioning: versioning as any,
            storageTier: storageTier as any,
          },
        });
        const b = response.bucket;
        return {
          success: true,
          name: b.name,
          namespace: b.namespace,
          compartmentId: b.compartmentId,
          message: `Bucket '${b.name}' created.`,
        };
      } catch (error: any) {
        return { success: false, error: error?.message ?? String(error) };
      }
    },
  });

/**
 * deleteBucket — Delete an empty Object Storage bucket.
 */
export const deleteBucket = () =>
  tool({
    description: "Delete an Object Storage bucket. The bucket must be empty first.",
    inputSchema: z.object({
      namespaceName: z.string().describe("Object Storage namespace."),
      bucketName: z.string().describe("Bucket name to delete."),
    }),
    execute: async ({ namespaceName, bucketName }) => {
      try {
        const client = objectStorageClient();
        await client.deleteBucket({ namespaceName, bucketName });
        return { success: true, message: `Bucket '${bucketName}' deleted.` };
      } catch (error: any) {
        return { success: false, error: error?.message ?? String(error) };
      }
    },
  });

/**
 * listObjects — List objects inside a bucket.
 */
export const listObjects = () =>
  tool({
    description:
      "List objects (files) inside an Object Storage bucket. " +
      "Supports prefix filtering and pagination.",
    inputSchema: z.object({
      namespaceName: z.string().describe("Object Storage namespace."),
      bucketName: z.string().describe("Bucket name."),
      prefix: z.string().optional().describe("Filter objects with this key prefix."),
      delimiter: z
        .string()
        .optional()
        .describe("Character used to group object names (like '/' for directory-like listing)."),
      limit: z
        .number()
        .int()
        .min(1)
        .max(1000)
        .optional()
        .default(100)
        .describe("Max objects to return. Default: 100."),
    }),
    execute: async ({ namespaceName, bucketName, prefix, delimiter, limit }) => {
      try {
        const client = objectStorageClient();
        const response = await client.listObjects({
          namespaceName,
          bucketName,
          prefix,
          delimiter,
          limit: limit ?? 100,
        });
        return {
          success: true,
          objects: (response.listObjects.objects ?? []).map((o) => ({
            name: o.name,
            size: o.size,
            md5: o.md5,
            timeCreated: o.timeCreated,
            timeModified: o.timeModified,
            storageTier: o.storageTier,
          })),
          prefixes: response.listObjects.prefixes ?? [],
          nextStartWith: response.listObjects.nextStartWith,
        };
      } catch (error: any) {
        return { success: false, error: error?.message ?? String(error) };
      }
    },
  });

/**
 * putObject — Upload a text or JSON object to Object Storage.
 */
export const putObject = () =>
  tool({
    description:
      "Upload a text, JSON, or string-serializable object to OCI Object Storage. " +
      "For binary files use a pipeline; this tool handles text/JSON up to ~50MB.",
    inputSchema: z.object({
      namespaceName: z.string().describe("Object Storage namespace."),
      bucketName: z.string().describe("Bucket name."),
      objectName: z.string().describe("Object key / path. E.g. 'data/report.json'."),
      content: z.string().describe("String content to upload."),
      contentType: z
        .string()
        .optional()
        .default("text/plain")
        .describe("MIME type. E.g. 'application/json', 'text/csv'. Default: text/plain."),
    }),
    execute: async ({ namespaceName, bucketName, objectName, content, contentType }) => {
      try {
        const client = objectStorageClient();
        const bodyBuffer = Buffer.from(content, "utf-8");
        await client.putObject({
          namespaceName,
          bucketName,
          objectName,
          putObjectBody: Readable.from(bodyBuffer),
          contentLength: bodyBuffer.byteLength,
          contentType: contentType ?? "text/plain",
        });
        return {
          success: true,
          message: `Object '${objectName}' uploaded to bucket '${bucketName}' (${bodyBuffer.byteLength} bytes).`,
        };
      } catch (error: any) {
        return { success: false, error: error?.message ?? String(error) };
      }
    },
  });

/**
 * getObject — Download a text object from Object Storage.
 */
export const getObject = () =>
  tool({
    description:
      "Download the content of an object from OCI Object Storage. " +
      "Returns the object content as a UTF-8 string (truncated at 50KB for large files).",
    inputSchema: z.object({
      namespaceName: z.string().describe("Object Storage namespace."),
      bucketName: z.string().describe("Bucket name."),
      objectName: z.string().describe("Object key. E.g. 'data/report.json'."),
    }),
    execute: async ({ namespaceName, bucketName, objectName }) => {
      try {
        const client = objectStorageClient();
        const response = await client.getObject({ namespaceName, bucketName, objectName });

        const content = await streamToString(response.value as NodeJS.ReadableStream);
        const MAX_CHARS = 50_000;
        const truncated = content.length > MAX_CHARS;

        return {
          success: true,
          objectName,
          contentType: response.contentType,
          contentLength: response.contentLength,
          content: truncated ? content.slice(0, MAX_CHARS) + "\n\n[...truncated]" : content,
          truncated,
        };
      } catch (error: any) {
        return { success: false, error: error?.message ?? String(error) };
      }
    },
  });

/**
 * deleteObject — Delete an object from Object Storage.
 */
export const deleteObject = () =>
  tool({
    description: "Delete an object from an OCI Object Storage bucket.",
    inputSchema: z.object({
      namespaceName: z.string().describe("Object Storage namespace."),
      bucketName: z.string().describe("Bucket name."),
      objectName: z.string().describe("Object key to delete."),
    }),
    execute: async ({ namespaceName, bucketName, objectName }) => {
      try {
        const client = objectStorageClient();
        await client.deleteObject({ namespaceName, bucketName, objectName });
        return { success: true, message: `Object '${objectName}' deleted from '${bucketName}'.` };
      } catch (error: any) {
        return { success: false, error: error?.message ?? String(error) };
      }
    },
  });

/**
 * createPreauthenticatedRequest — Generate a pre-auth (public) URL for an object.
 */
export const createPreauthenticatedRequest = () =>
  tool({
    description:
      "Create a Pre-Authenticated Request (PAR) — a temporary public URL to read or write " +
      "an object in Object Storage without authentication. Specify the expiry time.",
    inputSchema: z.object({
      namespaceName: z.string().describe("Object Storage namespace."),
      bucketName: z.string().describe("Bucket name."),
      objectName: z
        .string()
        .optional()
        .describe("Object key. Omit to create a bucket-level PAR."),
      name: z.string().describe("Human-readable label for this PAR."),
      accessType: z
        .enum(["ObjectRead", "ObjectWrite", "ObjectReadWrite", "AnyObjectWrite", "AnyObjectRead", "AnyObjectReadWrite"])
        .default("ObjectRead")
        .describe("Access level. Default: ObjectRead."),
      expiresInHours: z
        .number()
        .min(1)
        .max(8760)
        .default(24)
        .describe("How many hours until this PAR expires. Default: 24h."),
    }),
    execute: async ({ namespaceName, bucketName, objectName, name, accessType, expiresInHours }) => {
      try {
        const client = objectStorageClient();
        const expiresOn = new Date(Date.now() + expiresInHours * 60 * 60 * 1000);
        const response = await client.createPreauthenticatedRequest({
          namespaceName,
          bucketName,
          createPreauthenticatedRequestDetails: {
            name,
            objectName,
            accessType: accessType as any,
            timeExpires: expiresOn,
          },
        });
        const par = response.preauthenticatedRequest;
        const baseUrl = `https://objectstorage.${process.env.OCI_REGION ?? "us-ashburn-1"}.oraclecloud.com`;
        return {
          success: true,
          parId: par.id,
          name: par.name,
          accessUri: par.accessUri,
          fullUrl: `${baseUrl}${par.accessUri}`,
          timeExpires: par.timeExpires,
          message: `PAR created. Expires: ${par.timeExpires}.`,
        };
      } catch (error: any) {
        return { success: false, error: error?.message ?? String(error) };
      }
    },
  });

// =============================================================================
// DATABASE (Autonomous Database)
// =============================================================================

/**
 * listAutonomousDatabases — List Autonomous Databases.
 */
export const listAutonomousDatabases = () =>
  tool({
    description:
      "List all Autonomous Databases (ATP/ADW) in a compartment. " +
      "Returns OCIDs, display names, DB names, workload types, and lifecycle states.",
    inputSchema: z.object({
      compartmentId: z.string().optional().describe("Compartment OCID."),
      lifecycleState: z
        .enum(["PROVISIONING", "AVAILABLE", "STOPPING", "STOPPED", "STARTING", "TERMINATING", "TERMINATED"])
        .optional()
        .describe("Filter by lifecycle state."),
    }),
    execute: async ({ compartmentId, lifecycleState }) => {
      try {
        const client = databaseClient();
        const response = await client.listAutonomousDatabases({
          compartmentId: comp(compartmentId),
          lifecycleState: lifecycleState as any,
        });
        return {
          success: true,
          databases: response.items.map((db) => ({
            id: db.id,
            displayName: db.displayName,
            dbName: db.dbName,
            lifecycleState: db.lifecycleState,
            workloadType: db.dbWorkload,
            cpuCoreCount: db.cpuCoreCount,
            dataStorageSizeInTBs: db.dataStorageSizeInTBs,
            isAutoScalingEnabled: db.isAutoScalingEnabled,
            dbVersion: db.dbVersion,
            timeCreated: db.timeCreated,
            connectionStrings: db.connectionStrings,
          })),
        };
      } catch (error: any) {
        return { success: false, error: error?.message ?? String(error) };
      }
    },
  });

/**
 * getAutonomousDatabase — Get Autonomous Database details.
 */
export const getAutonomousDatabase = () =>
  tool({
    description: "Get detailed info about a specific Autonomous Database.",
    inputSchema: z.object({
      autonomousDatabaseId: z.string().describe("Autonomous Database OCID."),
    }),
    execute: async ({ autonomousDatabaseId }) => {
      try {
        const client = databaseClient();
        const response = await client.getAutonomousDatabase({ autonomousDatabaseId });
        const db = response.autonomousDatabase;
        return {
          success: true,
          id: db.id,
          displayName: db.displayName,
          dbName: db.dbName,
          lifecycleState: db.lifecycleState,
          workloadType: db.dbWorkload,
          cpuCoreCount: db.cpuCoreCount,
          dataStorageSizeInTBs: db.dataStorageSizeInTBs,
          isAutoScalingEnabled: db.isAutoScalingEnabled,
          dbVersion: db.dbVersion,
          serviceConsoleUrl: db.serviceConsoleUrl,
          connectionStrings: db.connectionStrings,
          isFreeTier: db.isFreeTier,
        };
      } catch (error: any) {
        return { success: false, error: error?.message ?? String(error) };
      }
    },
  });

/**
 * createAutonomousDatabase — Provision a new Autonomous Database.
 */
export const createAutonomousDatabase = () =>
  tool({
    description:
      "Create a new Autonomous Database (ATP = Transaction Processing, ADW = Data Warehouse). " +
      "Returns the new database OCID. Allow ~5 minutes for provisioning.",
    inputSchema: z.object({
      compartmentId: z.string().optional().describe("Compartment OCID."),
      displayName: z.string().describe("Display name."),
      dbName: z
        .string()
        .describe("Database name (alphanumeric, no spaces, max 14 chars). E.g. 'MYDB1'."),
      adminPassword: z
        .string()
        .describe("Admin password (12-30 chars, mix of uppercase, lowercase, number, special)."),
      workloadType: z
        .enum(["OLTP", "DW", "AJD", "APEX"])
        .default("OLTP")
        .describe("Workload type: OLTP=Transaction Processing, DW=Data Warehouse. Default: OLTP."),
      cpuCoreCount: z.number().int().min(1).default(1).describe("CPU core count. Default: 1."),
      dataStorageSizeInTBs: z
        .number()
        .int()
        .min(1)
        .default(1)
        .describe("Storage in TB. Default: 1."),
      isAutoScalingEnabled: z
        .boolean()
        .optional()
        .default(false)
        .describe("Enable auto-scaling. Default: false."),
      isFreeTier: z
        .boolean()
        .optional()
        .default(false)
        .describe("Create on Always Free tier (1 OCPU, 20GB). Default: false."),
    }),
    execute: async ({
      compartmentId,
      displayName,
      dbName,
      adminPassword,
      workloadType,
      cpuCoreCount,
      dataStorageSizeInTBs,
      isAutoScalingEnabled,
      isFreeTier,
    }) => {
      try {
        const client = databaseClient();
        const response = await client.createAutonomousDatabase({
          createAutonomousDatabaseDetails: {
            compartmentId: comp(compartmentId),
            displayName,
            dbName,
            adminPassword,
            dbWorkload: workloadType as any,
            cpuCoreCount,
            dataStorageSizeInTBs,
            isAutoScalingEnabled: isAutoScalingEnabled ?? false,
            isFreeTier: isFreeTier ?? false,
          } as any,
        });
        const db = response.autonomousDatabase;
        return {
          success: true,
          id: db.id,
          displayName: db.displayName,
          dbName: db.dbName,
          lifecycleState: db.lifecycleState,
          message: `Autonomous Database '${db.displayName}' provisioning (id: ${db.id}).`,
        };
      } catch (error: any) {
        return { success: false, error: error?.message ?? String(error) };
      }
    },
  });

/**
 * autonomousDatabaseAction — Start or stop an Autonomous Database.
 */
export const autonomousDatabaseAction = () =>
  tool({
    description: "Start or stop an Autonomous Database.",
    inputSchema: z.object({
      autonomousDatabaseId: z.string().describe("Autonomous Database OCID."),
      action: z.enum(["start", "stop"]).describe("Action to perform."),
    }),
    execute: async ({ autonomousDatabaseId, action }) => {
      try {
        const client = databaseClient();
        let db;
        if (action === "start") {
          const r = await client.startAutonomousDatabase({ autonomousDatabaseId });
          db = r.autonomousDatabase;
        } else {
          const r = await client.stopAutonomousDatabase({ autonomousDatabaseId });
          db = r.autonomousDatabase;
        }
        return {
          success: true,
          id: db.id,
          lifecycleState: db.lifecycleState,
          message: `Database ${action} initiated. State: ${db.lifecycleState}.`,
        };
      } catch (error: any) {
        return { success: false, error: error?.message ?? String(error) };
      }
    },
  });

/**
 * deleteAutonomousDatabase — Terminate an Autonomous Database.
 */
export const deleteAutonomousDatabase = () =>
  tool({
    description: "Permanently delete (terminate) an Autonomous Database. Irreversible.",
    inputSchema: z.object({
      autonomousDatabaseId: z.string().describe("Autonomous Database OCID."),
    }),
    execute: async ({ autonomousDatabaseId }) => {
      try {
        const client = databaseClient();
        await client.deleteAutonomousDatabase({ autonomousDatabaseId });
        return { success: true, message: `Autonomous Database ${autonomousDatabaseId} termination initiated.` };
      } catch (error: any) {
        return { success: false, error: error?.message ?? String(error) };
      }
    },
  });

// =============================================================================
// CONTAINER ENGINE FOR KUBERNETES (OKE)
// =============================================================================

/**
 * listClusters — List OKE Kubernetes clusters.
 */
export const listClusters = () =>
  tool({
    description:
      "List Kubernetes clusters (OKE) in a compartment. " +
      "Returns cluster OCIDs, names, Kubernetes versions, and lifecycle states.",
    inputSchema: z.object({
      compartmentId: z.string().optional().describe("Compartment OCID."),
      lifecycleState: z
        .enum(["CREATING", "ACTIVE", "FAILED", "DELETING", "DELETED", "UPDATING"])
        .optional()
        .describe("Filter by lifecycle state."),
    }),
    execute: async ({ compartmentId, lifecycleState }) => {
      try {
        const client = containerEngineClient();
        const response = await client.listClusters({
          compartmentId: comp(compartmentId),
          lifecycleState: [lifecycleState as any].filter(Boolean),
        });
        return {
          success: true,
          clusters: response.items.map((c) => ({
            id: c.id,
            name: c.name,
            kubernetesVersion: c.kubernetesVersion,
            lifecycleState: c.lifecycleState,
            vcnId: c.vcnId,
            endpointConfig: c.endpointConfig,
            timeCreated: c.metadata?.timeCreated,
          })),
        };
      } catch (error: any) {
        return { success: false, error: error?.message ?? String(error) };
      }
    },
  });

/**
 * getCluster — Get OKE cluster details.
 */
export const getCluster = () =>
  tool({
    description: "Get detailed information about an OKE Kubernetes cluster.",
    inputSchema: z.object({
      clusterId: z.string().describe("Cluster OCID."),
    }),
    execute: async ({ clusterId }) => {
      try {
        const client = containerEngineClient();
        const response = await client.getCluster({ clusterId });
        const c = response.cluster;
        return {
          success: true,
          id: c.id,
          name: c.name,
          kubernetesVersion: c.kubernetesVersion,
          lifecycleState: c.lifecycleState,
          vcnId: c.vcnId,
          endpoints: c.endpoints,
          availableKubernetesUpgrades: c.availableKubernetesUpgrades,
        };
      } catch (error: any) {
        return { success: false, error: error?.message ?? String(error) };
      }
    },
  });

/**
 * listNodePools — List OKE node pools for a cluster.
 */
export const listNodePools = () =>
  tool({
    description: "List node pools for an OKE cluster.",
    inputSchema: z.object({
      compartmentId: z.string().optional().describe("Compartment OCID."),
      clusterId: z.string().optional().describe("Filter node pools for this cluster."),
    }),
    execute: async ({ compartmentId, clusterId }) => {
      try {
        const client = containerEngineClient();
        const response = await client.listNodePools({
          compartmentId: comp(compartmentId),
          clusterId,
        });
        return {
          success: true,
          nodePools: response.items.map((np) => ({
            id: np.id,
            name: np.name,
            clusterId: np.clusterId,
            nodeShape: np.nodeShape,
            kubernetesVersion: np.kubernetesVersion,
            lifecycleState: np.lifecycleState,
            nodeConfigDetails: np.nodeConfigDetails,
          })),
        };
      } catch (error: any) {
        return { success: false, error: error?.message ?? String(error) };
      }
    },
  });

/**
 * deleteCluster — Delete an OKE cluster.
 */
export const deleteCluster = () =>
  tool({
    description: "Delete an OKE Kubernetes cluster. Node pools must be deleted first.",
    inputSchema: z.object({
      clusterId: z.string().describe("Cluster OCID to delete."),
    }),
    execute: async ({ clusterId }) => {
      try {
        const client = containerEngineClient();
        await client.deleteCluster({ clusterId });
        return { success: true, message: `Cluster ${clusterId} deletion initiated.` };
      } catch (error: any) {
        return { success: false, error: error?.message ?? String(error) };
      }
    },
  });

// =============================================================================
// LOAD BALANCER
// =============================================================================

/**
 * listLoadBalancers — List load balancers.
 */
export const listLoadBalancers = () =>
  tool({
    description:
      "List all Load Balancers in a compartment. Returns LB OCIDs, display names, IP addresses, and states.",
    inputSchema: z.object({
      compartmentId: z.string().optional().describe("Compartment OCID."),
      lifecycleState: z
        .enum(["CREATING", "FAILED", "ACTIVE", "DELETING", "DELETED"])
        .optional()
        .describe("Filter by state."),
    }),
    execute: async ({ compartmentId, lifecycleState }) => {
      try {
        const client = loadBalancerClient();
        const response = await client.listLoadBalancers({
          compartmentId: comp(compartmentId),
          lifecycleState: lifecycleState as any,
        });
        return {
          success: true,
          loadBalancers: response.items.map((lb) => ({
            id: lb.id,
            displayName: lb.displayName,
            lifecycleState: lb.lifecycleState,
            shapeName: lb.shapeName,
            ipAddresses: lb.ipAddresses?.map((ip) => ({
              ipAddress: ip.ipAddress,
              isPublic: ip.isPublic,
            })),
            timeCreated: lb.timeCreated,
          })),
        };
      } catch (error: any) {
        return { success: false, error: error?.message ?? String(error) };
      }
    },
  });

/**
 * getLoadBalancer — Get load balancer details including backends.
 */
export const getLoadBalancer = () =>
  tool({
    description:
      "Get detailed info about a load balancer including backend sets, listeners, and certificates.",
    inputSchema: z.object({
      loadBalancerId: z.string().describe("Load Balancer OCID."),
    }),
    execute: async ({ loadBalancerId }) => {
      try {
        const client = loadBalancerClient();
        const response = await client.getLoadBalancer({ loadBalancerId });
        const lb = response.loadBalancer;
        return {
          success: true,
          id: lb.id,
          displayName: lb.displayName,
          lifecycleState: lb.lifecycleState,
          shapeName: lb.shapeName,
          ipAddresses: lb.ipAddresses,
          backendSets: lb.backendSets
            ? Object.fromEntries(
                Object.entries(lb.backendSets).map(([k, v]) => [
                  k,
                  {
                    policy: v.policy,
                    healthChecker: v.healthChecker,
                    backendCount: v.backends?.length ?? 0,
                  },
                ])
              )
            : {},
          listeners: lb.listeners
            ? Object.fromEntries(
                Object.entries(lb.listeners).map(([k, v]) => [
                  k,
                  { port: v.port, protocol: v.protocol, defaultBackendSetName: v.defaultBackendSetName },
                ])
              )
            : {},
        };
      } catch (error: any) {
        return { success: false, error: error?.message ?? String(error) };
      }
    },
  });

/**
 * deleteLoadBalancer — Delete a load balancer.
 */
export const deleteLoadBalancer = () =>
  tool({
    description: "Delete a load balancer permanently.",
    inputSchema: z.object({
      loadBalancerId: z.string().describe("Load Balancer OCID."),
    }),
    execute: async ({ loadBalancerId }) => {
      try {
        const client = loadBalancerClient();
        await client.deleteLoadBalancer({ loadBalancerId });
        return { success: true, message: `Load Balancer ${loadBalancerId} deletion initiated.` };
      } catch (error: any) {
        return { success: false, error: error?.message ?? String(error) };
      }
    },
  });

// =============================================================================
// MONITORING & ALARMS
// =============================================================================

/**
 * listMetrics — List available metrics for a namespace.
 */
export const listMetrics = () =>
  tool({
    description:
      "List available OCI monitoring metrics. Common namespaces: " +
      "'oci_computeagent' (CPU/memory), 'oci_blockstore' (disk), 'oci_lbaas' (LB).",
    inputSchema: z.object({
      compartmentId: z.string().optional().describe("Compartment OCID."),
      namespace: z
        .string()
        .optional()
        .describe("Metric namespace. E.g. 'oci_computeagent', 'oci_blockstore'."),
      name: z.string().optional().describe("Filter by metric name. E.g. 'CpuUtilization'."),
    }),
    execute: async ({ compartmentId, namespace, name }) => {
      try {
        const client = monitoringClient();
        const response = await client.listMetrics({
          compartmentId: comp(compartmentId),
          listMetricsDetails: {
            namespace,
            name,
          },
        });
        return {
          success: true,
          metrics: response.items.map((m) => ({
            namespace: m.namespace,
            name: m.name,
            dimensions: m.dimensions,
          })),
        };
      } catch (error: any) {
        return { success: false, error: error?.message ?? String(error) };
      }
    },
  });

/**
 * summarizeMetricsData — Query metric data for a time range.
 */
export const summarizeMetricsData = () =>
  tool({
    description:
      "Query OCI metric time-series data. " +
      "Example query: 'CpuUtilization[1m].mean()' in namespace 'oci_computeagent'. " +
      "Returns data points within the specified time window.",
    inputSchema: z.object({
      compartmentId: z.string().optional().describe("Compartment OCID."),
      namespace: z.string().describe("Metric namespace. E.g. 'oci_computeagent'."),
      query: z
        .string()
        .describe("MQL metric query. E.g. 'CpuUtilization[1m].mean()'."),
      startTimeIso: z
        .string()
        .optional()
        .describe("Start time in ISO 8601. Defaults to 1 hour ago."),
      endTimeIso: z
        .string()
        .optional()
        .describe("End time in ISO 8601. Defaults to now."),
      resolution: z
        .string()
        .optional()
        .describe("Aggregation interval. E.g. '1m', '5m', '1h'."),
    }),
    execute: async ({ compartmentId, namespace, query, startTimeIso, endTimeIso, resolution }) => {
      try {
        const client = monitoringClient();
        const endTime = endTimeIso ? new Date(endTimeIso) : new Date();
        const startTime = startTimeIso ? new Date(startTimeIso) : new Date(endTime.getTime() - 3600_000);

        const response = await client.summarizeMetricsData({
          compartmentId: comp(compartmentId),
          summarizeMetricsDataDetails: {
            namespace,
            query,
            startTime,
            endTime,
            resolution,
          },
        });

        return {
          success: true,
          metrics: response.items.map((item) => ({
            namespace: item.namespace,
            name: item.name,
            dimensions: item.dimensions,
            aggregatedDatapoints: item.aggregatedDatapoints?.map((dp) => ({
              timestamp: dp.timestamp,
              value: dp.value,
            })),
          })),
        };
      } catch (error: any) {
        return { success: false, error: error?.message ?? String(error) };
      }
    },
  });

/**
 * listAlarms — List OCI Monitoring alarms.
 */
export const listAlarms = () =>
  tool({
    description: "List all OCI Monitoring alarms in a compartment.",
    inputSchema: z.object({
      compartmentId: z.string().optional().describe("Compartment OCID."),
      lifecycleState: z
        .enum(["ACTIVE", "DELETING", "DELETED"])
        .optional()
        .describe("Filter by alarm state."),
    }),
    execute: async ({ compartmentId, lifecycleState }) => {
      try {
        const client = monitoringClient();
        const response = await client.listAlarms({
          compartmentId: comp(compartmentId),
          lifecycleState: lifecycleState as any,
        });
        return {
          success: true,
          alarms: response.items.map((a) => ({
            id: a.id,
            displayName: a.displayName,
            namespace: a.namespace,
            query: a.query,
            severity: a.severity,
            isEnabled: a.isEnabled,
            lifecycleState: a.lifecycleState,
          })),
        };
      } catch (error: any) {
        return { success: false, error: error?.message ?? String(error) };
      }
    },
  });

/**
 * getAlarmStatus — Get current firing status of all alarms.
 */
export const getAlarmStatus = () =>
  tool({
    description: "Get the current FIRING / OK status of all alarms in a compartment.",
    inputSchema: z.object({
      compartmentId: z.string().optional().describe("Compartment OCID."),
    }),
    execute: async ({ compartmentId }) => {
      try {
        const client = monitoringClient();
        const response = await client.listAlarmsStatus({
          compartmentId: comp(compartmentId),
        });
        return {
          success: true,
          alarmStatuses: response.items.map((a) => ({
            id: a.id,
            displayName: a.displayName,
            severity: a.severity,
            status: a.status,
            timestampTriggered: a.timestampTriggered,
          })),
        };
      } catch (error: any) {
        return { success: false, error: error?.message ?? String(error) };
      }
    },
  });

// =============================================================================
// DNS
// =============================================================================

/**
 * listDnsZones — List DNS zones.
 */
export const listDnsZones = () =>
  tool({
    description: "List all DNS zones in a compartment.",
    inputSchema: z.object({
      compartmentId: z.string().optional().describe("Compartment OCID."),
      zoneType: z
        .enum(["PRIMARY", "SECONDARY"])
        .optional()
        .describe("Filter by zone type."),
    }),
    execute: async ({ compartmentId, zoneType }) => {
      try {
        const client = dnsClient();
        const response = await client.listZones({
          compartmentId: comp(compartmentId),
          zoneType: zoneType as any,
        });
        return {
          success: true,
          zones: response.items.map((z) => ({
            id: z.id,
            name: z.name,
            zoneType: z.zoneType,
            lifecycleState: z.lifecycleState,
            serial: z.serial,
            timeCreated: z.timeCreated,
          })),
        };
      } catch (error: any) {
        return { success: false, error: error?.message ?? String(error) };
      }
    },
  });

/**
 * getDnsZoneRecords — Get DNS records in a zone.
 */
export const getDnsZoneRecords = () =>
  tool({
    description: "Get all DNS records in a zone. Optionally filter by record type (A, CNAME, MX, etc.).",
    inputSchema: z.object({
      zoneNameOrId: z.string().describe("Zone name (e.g. 'example.com') or OCID."),
      compartmentId: z.string().optional().describe("Compartment OCID."),
      rtype: z
        .string()
        .optional()
        .describe("Filter by record type. E.g. 'A', 'CNAME', 'MX', 'TXT'."),
    }),
    execute: async ({ zoneNameOrId, compartmentId, rtype }) => {
      try {
        const client = dnsClient();
        const response = await client.getZoneRecords({
          zoneNameOrId,
          compartmentId: compartmentId ? comp(compartmentId) : undefined,
          rtype,
        });
        return {
          success: true,
          records: response.recordCollection.items?.map((r) => ({
            domain: r.domain,
            rtype: r.rtype,
            rdata: r.rdata,
            ttl: r.ttl,
            recordHash: r.recordHash,
          })),
        };
      } catch (error: any) {
        return { success: false, error: error?.message ?? String(error) };
      }
    },
  });

/**
 * createDnsZone — Create a new DNS zone.
 */
export const createDnsZone = () =>
  tool({
    description: "Create a new primary DNS zone (e.g. 'myapp.example.com').",
    inputSchema: z.object({
      compartmentId: z.string().optional().describe("Compartment OCID."),
      name: z.string().describe("Zone name. E.g. 'myapp.example.com'."),
    }),
    execute: async ({ compartmentId, name }) => {
      try {
        const client = dnsClient();
        const response = await client.createZone({
          createZoneDetails: {
            compartmentId: comp(compartmentId),
            name,
            zoneType: "PRIMARY",
          } as any,
        });
        const z = response.zone;
        return {
          success: true,
          id: z.id,
          name: z.name,
          lifecycleState: z.lifecycleState,
          nameservers: z.nameservers,
          message: `DNS zone '${z.name}' created.`,
        };
      } catch (error: any) {
        return { success: false, error: error?.message ?? String(error) };
      }
    },
  });

/**
 * deleteDnsZone — Delete a DNS zone.
 */
export const deleteDnsZone = () =>
  tool({
    description: "Delete a DNS zone. All records in the zone will be deleted.",
    inputSchema: z.object({
      zoneNameOrId: z.string().describe("Zone name or OCID to delete."),
      compartmentId: z.string().optional().describe("Compartment OCID."),
    }),
    execute: async ({ zoneNameOrId, compartmentId }) => {
      try {
        const client = dnsClient();
        await client.deleteZone({
          zoneNameOrId,
          compartmentId: compartmentId ? comp(compartmentId) : undefined,
        });
        return { success: true, message: `DNS zone '${zoneNameOrId}' deletion initiated.` };
      } catch (error: any) {
        return { success: false, error: error?.message ?? String(error) };
      }
    },
  });