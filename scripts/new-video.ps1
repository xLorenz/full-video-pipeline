param(
    [Parameter(Mandatory=$true)]
    [string]$Title
)

$PipelineRoot = Split-Path $PSScriptRoot -Parent
$VideoDir = Join-Path $PipelineRoot "videos\$Title"
$RemotionDir = Join-Path $VideoDir "remotion"
$FoundationDir = Join-Path $PipelineRoot "remotion-foundation"

# Validate foundation exists
if (-not (Test-Path $FoundationDir)) {
    Write-Error "Foundation not found at $FoundationDir"
    exit 1
}

# Create directory structure
Write-Host "Creating directory structure..."
New-Item -ItemType Directory -Force -Path $RemotionDir\src\lib | Out-Null
New-Item -ItemType Directory -Force -Path $RemotionDir\src\scenes | Out-Null
New-Item -ItemType Directory -Force -Path $RemotionDir\public\voiceover | Out-Null

# Copy foundation config files
Write-Host "Copying foundation config files..."
Copy-Item "$FoundationDir\tsconfig.json" $RemotionDir -Force
Copy-Item "$FoundationDir\remotion.config.ts" $RemotionDir -Force
Copy-Item "$FoundationDir\eslint.config.mjs" $RemotionDir -Force
Copy-Item "$FoundationDir\.prettierrc" $RemotionDir -Force
Copy-Item "$FoundationDir\.gitignore" $RemotionDir -Force

# Create video-specific package.json
Write-Host "Creating package.json..."
$PackageJson = @"
{
  "name": "remotion-$Title",
  "version": "1.0.0",
  "private": true,
  "dependencies": {
    "remotion-foundation": "*"
  },
  "scripts": {
    "dev": "remotion studio",
    "build": "remotion bundle",
    "lint": "eslint src && tsc"
  },
  "sideEffects": ["*.css"]
}
"@
$PackageJson | Out-File -FilePath "$RemotionDir\package.json" -Encoding UTF8

# Create index.ts
Write-Host "Creating index.ts..."
$IndexTs = @"
import { registerRoot } from "remotion";
import { RemotionRoot } from "./Root";

registerRoot(RemotionRoot);
"@
$IndexTs | Out-File -FilePath "$RemotionDir\src\index.ts" -Encoding UTF8

# Create index.css
Write-Host "Creating index.css..."
$IndexCss = '@import "tailwindcss";'
$IndexCss | Out-File -FilePath "$RemotionDir\src\index.css" -Encoding UTF8

# Create styles.ts
Write-Host "Creating styles.ts..."
$StylesTs = @"
export const COLORS = {
  primary: "#0F1B2D",
  secondary: "#00BFA6",
  accent: "#FFB300",
  background: "#0A1220",
  text: "#FFFFFF",
  muted: "#4A5568",
  danger: "#EF4444",
  success: "#10B981",
  gridLine: "#1A2744",
} as const;

export const FONTS = {
  heading: "Inter",
  body: "Poppins",
} as const;
"@
$StylesTs | Out-File -FilePath "$RemotionDir\src\lib\styles.ts" -Encoding UTF8

# Create config.ts
Write-Host "Creating config.ts..."
$ConfigTs = @"
export const FPS = 30;
export const WIDTH = 1920;
export const HEIGHT = 1080;

export interface SceneData {
  id: number;
  title: string;
  durationInFrames: number;
  audioFile: string;
}

export const SCENES: SceneData[] = [];

export const TOTAL_DURATION_FRAMES = SCENES.reduce((sum, s) => sum + s.durationInFrames, 0);
"@
$ConfigTs | Out-File -FilePath "$RemotionDir\src\lib\config.ts" -Encoding UTF8

# Create Root.tsx
Write-Host "Creating Root.tsx..."
$RootTsx = @"
import React from "react";
import { Composition } from "remotion";
import { SCENES, FPS, WIDTH, HEIGHT } from "./lib/config";

export const RemotionRoot: React.FC = () => {
  return (
    <>
      {SCENES.map((scene) => {
        const SceneComponent = React.lazy(
          () => import(`./scenes/Scene${String(scene.id).padStart(2, "0")}`)
        );
        return (
          <Composition
            key={scene.id}
            id={`Scene${String(scene.id).padStart(2, "0")}`}
            component={SceneComponent}
            durationInFrames={scene.durationInFrames}
            fps={FPS}
            width={WIDTH}
            height={HEIGHT}
          />
        );
      })}
    </>
  );
};
"@
$RootTsx | Out-File -FilePath "$RemotionDir\src\Root.tsx" -Encoding UTF8

# Install dependencies
Write-Host "Installing dependencies..."
Push-Location $PipelineRoot
npm install 2>&1 | Out-Null
Pop-Location

Write-Host ""
Write-Host "Video scaffolded at: $VideoDir" -ForegroundColor Green
Write-Host ""
Write-Host "Next steps:"
Write-Host "  1. Edit src/lib/styles.ts with your color palette and fonts"
Write-Host "  2. Edit src/lib/config.ts with your scene data"
Write-Host "  3. Create scene components in src/scenes/SceneXX.tsx"
Write-Host "  4. Add voiceover files to public/voiceover/"
