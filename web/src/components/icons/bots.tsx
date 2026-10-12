import { BOT_VIEWBOX, BotBody, BotEyes } from "../bots/bot-shapes.tsx";
import { Icon, Knockout, type IconProps } from "./kit.tsx";

const FIT = `scale(${24 / BOT_VIEWBOX})`;

export function BotsIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <Knockout cuts={<g transform={FIT}><BotEyes /></g>}>
        <g transform={FIT}><BotBody shape="cloud" /></g>
      </Knockout>
    </Icon>
  );
}
