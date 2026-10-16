import { Icon, Knockout, Line, Turn, type IconProps } from "./kit.tsx";

const THUMB_CUFF = "M3.5 10.5H6.5V21H3.5A1 1 0 0 1 2.5 20V11.5A1 1 0 0 1 3.5 10.5Z";
const THUMB_HAND =
  "M8.5 10.5L12 3.6C12.3 3 13 2.7 13.7 2.9C15 3.3 15.7 4.6 15.4 5.9L14.6 9.5H19.3C20.8 9.5 21.9 10.9 21.6 12.4L20.3 18.9C20 20.1 19 21 17.8 21H8.5Z";
const HEART =
  "M12 20.5C12 20.5 2.75 15 2.75 8.6C2.75 5.8 4.9 3.75 7.5 3.75C9.3 3.75 11 4.8 12 6.4C13 4.8 14.7 3.75 16.5 3.75C19.1 3.75 21.25 5.8 21.25 8.6C21.25 15 12 20.5 12 20.5Z";
const FACE_RADIUS = 9.5;
const EYE_RADIUS = 1.4;
const EYES = [9, 15];
const EYE_HEIGHT = 9.75;
const SMILE = "M8.25 14.25C9.2 15.6 10.5 16.25 12 16.25C13.5 16.25 14.8 15.6 15.75 14.25";
const SMILE_WIDTH = 2;

function Thumb(props: IconProps & { down?: boolean }) {
  const { down, ...icon } = props;
  return (
    <Icon {...icon}>
      <Turn degrees={down ? 180 : undefined} mirror={down}>
        <path d={THUMB_CUFF} />
        <path d={THUMB_HAND} />
      </Turn>
    </Icon>
  );
}

export function ThumbUpIcon(props: IconProps) {
  return <Thumb {...props} />;
}

export function ThumbDownIcon(props: IconProps) {
  return <Thumb {...props} down />;
}

export function HeartIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d={HEART} />
    </Icon>
  );
}

export function SmileIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <Knockout
        cuts={
          <>
            {EYES.map((x) => (
              <circle key={x} cx={x} cy={EYE_HEIGHT} r={EYE_RADIUS} />
            ))}
            <Line d={SMILE} width={SMILE_WIDTH} />
          </>
        }
      >
        <circle cx={12} cy={12} r={FACE_RADIUS} />
      </Knockout>
    </Icon>
  );
}
