"use client";

import React, { useState } from "react";

interface BrandLogoProps {
  className?: string;
  showSubtitle?: boolean;
  subtitleText?: string;
}

export function BrandLogo({
  className = "h-8 w-auto",
  showSubtitle = true,
  subtitleText = "Admin Suite",
}: BrandLogoProps) {
  const [imgError, setImgError] = useState(false);

  return (
    <div className="flex items-center gap-2.5">
      {!imgError ? (
        <img
          alt="ACI Career EDGE Logo"
          className={`${className} object-contain`}
          src="https://lh3.googleusercontent.com/aida/AEtjO1WoneBy-OBalyMRJ-gJG9yzWiVlwNqZc3eODDaWgTSBU-nVaZ5R1Qs_FeQXdoLYFMsVmCuiN3VhX0g1wXsJx7fsa9T_uIO8UslPbn_cDuqCRRIR860-at1nZLWxWyfLMZ1BlcKHXLLT_hKe1xshvFsKaHWwnd1IdVzM89A-FdEbTjIIjtyUTKUWZulnyqIpS8HtvE8CR-A7HPY0Shlvws72AFyyVXVnjlnag7Y-Y832rWsm7yyIv3WHjuk"
          onError={() => setImgError(true)}
        />
      ) : (
        <div className="w-8 h-8 rounded bg-primary-container text-on-primary flex items-center justify-center font-bold text-sm tracking-tighter">
          CE
        </div>
      )}
      <div className="flex flex-col">
        <span className="font-headline-sm text-on-surface leading-none font-semibold">
          Assess
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
