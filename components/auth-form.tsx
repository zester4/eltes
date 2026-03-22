"use client";

import Form from "next/form";
import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import Link from "next/link";

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
        <Label
          className="text-muted-foreground"
          htmlFor="email"
        >
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
        <Label
          className="text-muted-foreground"
          htmlFor="password"
        >
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
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-md text-muted-foreground hover:text-foreground transition-colors"
          >
            {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </div>
      </div>

      {showLegal && (
        <div className="flex items-start gap-2 px-1 mt-1">
          <input 
            type="checkbox" 
            id="legal" 
            name="legal" 
            required 
            className="mt-1"
          />
          <label htmlFor="legal" className="text-xs text-muted-foreground leading-relaxed">
            I agree to the <Link href="/terms" target="_blank" className="text-primary hover:underline">Terms of Service</Link> and <Link href="/privacy" target="_blank" className="text-primary hover:underline">Privacy Policy</Link>.
          </label>
        </div>
      )}

      <div className="pt-2">
        {children}
      </div>
    </Form>
  );
}
