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
          className="text-xs font-bold text-white/40 uppercase tracking-widest pl-1"
          htmlFor="email"
        >
          Email Address
        </Label>

        <Input
          autoComplete="email"
          autoFocus
          className="bg-white/5 border-white/10 h-12 text-white placeholder:text-white/20 rounded-xl"
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
          className="text-xs font-bold text-white/40 uppercase tracking-widest pl-1"
          htmlFor="password"
        >
          Password
        </Label>

        <div className="relative group">
          <Input
            className="bg-white/5 border-white/10 h-12 text-white pr-12 rounded-xl"
            id="password"
            name="password"
            required
            type={showPassword ? "text" : "password"}
          />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 rounded-lg text-white/40 hover:text-white hover:bg-white/5 transition-all outline-none focus:ring-2 focus:ring-white/20"
          >
            {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </div>
      </div>

      {showLegal && (
        <div className="flex items-start gap-3 px-1 mt-2">
          <div className="pt-1">
            <input 
              type="checkbox" 
              id="legal" 
              name="legal" 
              required 
              className="w-4 h-4 rounded-md bg-white/5 border-white/10 checked:bg-white checked:border-white transition-all cursor-pointer accent-white"
            />
          </div>
          <label htmlFor="legal" className="text-xs text-white/40 leading-relaxed cursor-pointer select-none">
            I agree to the <Link href="/terms" target="_blank" className="text-white hover:underline">Terms of Service</Link> and <Link href="/privacy" target="_blank" className="text-white hover:underline">Privacy Policy</Link>.
          </label>
        </div>
      )}

      <div className="pt-4">
        {children}
      </div>
    </Form>
  );
}
