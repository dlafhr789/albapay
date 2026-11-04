// 시안에서 쓴 선 아이콘. 외부 아이콘 폰트나 CDN을 쓰지 않는다(CSP default-src 'self').

interface IconProps {
  size?: number;
}

function Svg({ size = 24, strokeWidth = 1.8, children }: IconProps & { strokeWidth?: number; children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

export const CalendarIcon = (props: IconProps) => (
  <Svg {...props}>
    <rect x="3.5" y="5" width="17" height="15.5" rx="3" />
    <path d="M3.5 10h17M8 3v4M16 3v4" />
  </Svg>
);

export const ReceiptIcon = (props: IconProps) => (
  <Svg {...props}>
    <path d="M6 3.5h12v17l-2.5-1.6-2.5 1.6-2.5-1.6-2.5 1.6L6 18.9z" />
    <path d="M9 8.5h6M9 12h6" />
  </Svg>
);

export const RepeatIcon = (props: IconProps) => (
  <Svg {...props}>
    <path d="M17 2.5l3 3-3 3" />
    <path d="M4 11.5v-1a5 5 0 0 1 5-5h11" />
    <path d="M7 21.5l-3-3 3-3" />
    <path d="M20 12.5v1a5 5 0 0 1-5 5H4" />
  </Svg>
);

export const SlidersIcon = (props: IconProps) => (
  <Svg {...props}>
    <path d="M4 7h10M18 7h2M4 17h4M12 17h8" />
    <circle cx="16" cy="7" r="2" />
    <circle cx="10" cy="17" r="2" />
  </Svg>
);

export const ChevronLeft = ({ size = 20 }: IconProps) => (
  <Svg size={size} strokeWidth={2}>
    <path d="M15 6l-6 6 6 6" />
  </Svg>
);

export const ChevronRight = ({ size = 20 }: IconProps) => (
  <Svg size={size} strokeWidth={2}>
    <path d="M9 6l6 6-6 6" />
  </Svg>
);

export const PlusIcon = ({ size = 20 }: IconProps) => (
  <Svg size={size} strokeWidth={2.2}>
    <path d="M12 5v14M5 12h14" />
  </Svg>
);

export const CloseIcon = ({ size = 18 }: IconProps) => (
  <Svg size={size} strokeWidth={2}>
    <path d="M6 6l12 12M18 6L6 18" />
  </Svg>
);

export const InfoIcon = ({ size = 18 }: IconProps) => (
  <Svg size={size}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 11v5M12 8h.01" />
  </Svg>
);

export const WalletIcon = ({ size = 28 }: IconProps) => (
  <Svg size={size} strokeWidth={2}>
    <rect x="3" y="6" width="18" height="13" rx="3" />
    <path d="M3 10h18M16 14.5h2" />
  </Svg>
);
