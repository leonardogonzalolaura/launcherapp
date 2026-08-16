interface HomeIconProps {
  size?: number;
  className?: string;
  style?: React.CSSProperties;
}

export function HomeIcon({ size = 14, className, style }: HomeIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="currentColor"
      className={className}
      style={style}
      aria-hidden="true"
    >
      <path d="M6.5 14.5v-3.505c0-.905.908-1.505 2-1.505s2 .6 2 1.505v3.505a.5.5 0 0 0 .5.5h2a.5.5 0 0 0 .5-.5v-6.335a.5.5 0 0 0-.126-.336L8.385 3.09a.5.5 0 0 0-.77 0L2.626 7.329a.5.5 0 0 0-.126.336V14.5a.5.5 0 0 0 .5.5h2a.5.5 0 0 0 .5-.5Z" />
    </svg>
  );
}