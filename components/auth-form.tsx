"use client";

import { Eye, EyeOff } from "lucide-react";
import Form from "next/form";
import Link from "next/link";
import { useState } from "react";
import { Input } from "./ui/input";
import { Label } from "./ui/label";

export function AuthForm({
  action,
  children,
  defaultEmail = "",
  showLegal = false,
}: {
  action: NonNullable<
    string | ((formData: FormData) => void | Promise<void>) | undefined
  >;
  children: React.ReactNode;
  defaultEmail?: string;
  showLegal?: boolean;
}) {
  const [showPassword, setShowPassword] = useState(false);

  return (
    <Form action={action} className="flex flex-col gap-4 w-full">
      <div className="flex flex-col gap-2">
        <Label className="text-muted-foreground" htmlFor="email">
          Email Address
        </Label>

        <Input
          autoComplete="email"
          autoFocus
          className="bg-muted/50 border-border h-10 text-foreground"
          defaultValue={defaultEmail}
          id="email"
          name="email"
          placeholder="user@acme.com"
          required
          type="email"
        />
      </div>

      <div className="flex flex-col gap-2 relative">
        <Label className="text-muted-foreground" htmlFor="password">
          Password
        </Label>

        <div className="relative group">
          <Input
            className="bg-muted/50 border-border h-10 text-foreground pr-10"
            id="password"
            name="password"
            required
            type={showPassword ? "text" : "password"}
          />
          <button
            className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-md text-muted-foreground hover:text-foreground transition-colors"
            onClick={() => setShowPassword(!showPassword)}
            type="button"
          >
            {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </div>
      </div>

      {showLegal && (
        <div className="flex items-start gap-2 px-1 mt-1">
          <input
            className="mt-1"
            id="legal"
            name="legal"
            required
            type="checkbox"
          />
          <label
            className="text-xs text-muted-foreground leading-relaxed"
            htmlFor="legal"
          >
            I agree to the{" "}
            <Link
              className="text-primary hover:underline"
              href="/terms"
              target="_blank"
            >
              Terms of Service
            </Link>{" "}
            and{" "}
            <Link
              className="text-primary hover:underline"
              href="/privacy"
              target="_blank"
            >
              Privacy Policy
            </Link>
            .
          </label>
        </div>
      )}

      <div className="pt-2">{children}</div>
    </Form>
  );
}
