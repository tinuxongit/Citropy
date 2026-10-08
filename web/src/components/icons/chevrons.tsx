import { BOLD_LINE, Icon, Line, Turn, type IconProps } from "./kit.tsx";

const CHEVRON_RIGHT = "M9 5.5L15.5 12L9 18.5";

function Chevron({ degrees, ...props }: IconProps & { degrees: number }) {
  return <Icon {...props}><Turn degrees={degrees}><Line d={CHEVRON_RIGHT} width={BOLD_LINE} /></Turn></Icon>;
}

export function ChevronRightIcon(props: IconProps) {
  return <Chevron degrees={0} {...props} />;
}

export function ChevronDownIcon(props: IconProps) {
  return <Chevron degrees={90} {...props} />;
}

export function ChevronLeftIcon(props: IconProps) {
  return <Chevron degrees={180} {...props} />;
}

export function ChevronUpIcon(props: IconProps) {
  return <Chevron degrees={270} {...props} />;
}
