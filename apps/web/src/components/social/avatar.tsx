import { avatarTone, initials } from "@musicjunkie/shared";

type AvatarProps = {
  userId: string;
  name: string;
  /** A signed link to the uploaded avatar, if there is one. */
  src?: string | null;
  size?: number;
  className?: string;
};

/**
 * A person's avatar: their photo, or their initials on a color picked from their id.
 * Decorative (alt=""): the name is always shown next to it.
 */
export function Avatar({ userId, name, src, size = 44, className = "" }: AvatarProps) {
  const style = { width: size, height: size };
  if (src) {
    return (
      // Signed links expire after an hour; next/image's optimizer would cache them.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt=""
        style={style}
        className={`shrink-0 rounded-full object-cover ${className}`}
      />
    );
  }
  return (
    <span
      aria-hidden
      style={{ ...style, backgroundColor: avatarTone(userId), fontSize: Math.round(size * 0.36) }}
      className={`flex shrink-0 items-center justify-center rounded-full font-extrabold text-white ${className}`}
    >
      {initials(name)}
    </span>
  );
}
