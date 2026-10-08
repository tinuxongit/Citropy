import { siGit, siGithub, type SimpleIcon } from "simple-icons";

const GIT_INSET = 0;
const GITHUB_INSET = 1.5;

function brandIcon(icon: SimpleIcon, inset: number) {
  const viewBox = `${-inset} ${-inset} ${24 + inset * 2} ${24 + inset * 2}`;
  return function BrandIcon({ size = 24 }: { size?: number }) {
    return (
      <svg className="solid-icon" width={size} height={size} viewBox={viewBox} fill="currentColor" aria-hidden="true">
        <path d={icon.path} />
      </svg>
    );
  };
}

export const GitIcon = brandIcon(siGit, GIT_INSET);
export const GitHubIcon = brandIcon(siGithub, GITHUB_INSET);
