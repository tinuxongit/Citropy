import { BotEyes } from "../bots/bot-faces.tsx";
import { BOT_VIEWBOX, shapeGeometry } from "../bots/bot-shapes.tsx";
import { Icon, Knockout, type IconProps } from "./kit.tsx";

const FIT = `scale(${24 / BOT_VIEWBOX})`;
const { body, face } = shapeGeometry("cloud");

export function BotsIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <Knockout
        cuts={
          <g transform={`${FIT} translate(${face.x} ${face.y})`}>
            <BotEyes face="neutral" />
          </g>
        }
      >
        <g transform={FIT}>{body}</g>
      </Knockout>
    </Icon>
  );
}
