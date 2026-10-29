"use client";

import React, { useState } from "react";

interface BrandLogoProps {
  className?: string;
  showSubtitle?: boolean;
  subtitleText?: string;
  variant?: "emblem" | "full";
}

export function BrandLogo({
  className = "h-8 w-8",
  showSubtitle = true,
  subtitleText = "Admin Suite",
  variant = "emblem",
}: BrandLogoProps) {
  const [imgError, setImgError] = useState(false);
  const logoSrc = variant === "full" ? "/aci-full-logo.png" : "/aci-emblem.png";

  return (
    <div className="flex items-center gap-2.5">
      {!imgError ? (
        <img
          alt="ACI Career EDGE Logo"
          className={`${className} object-contain shrink-0`}
          src={logoSrc}
          onError={() => setImgError(true)}
        />
      ) : (
        <div className="w-8 h-8 rounded-full bg-primary-container text-on-primary flex items-center justify-center font-bold text-xs tracking-tighter shrink-0">
          ACI
        </div>
      )}
      <div className="flex flex-col">
        <span className="font-headline-sm text-on-surface leading-none font-semibold tracking-tight">
          Career EDGE Assess
        </span>
        {showSubtitle && (
          <span className="font-label-xs text-secondary leading-tight mt-0.5">
            {subtitleText}
          </span>
        )}
      </div>
    </div>
  );
}
