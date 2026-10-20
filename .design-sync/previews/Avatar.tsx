import { Avatar, AvatarFallback, AvatarImage } from "macae-classificados";

const PORTRAIT
  = "data:image/svg+xml;utf8,"
    + encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96">
        <rect width="96" height="96" fill="#1f2fd8"/>
        <circle cx="48" cy="38" r="17" fill="#dfe4ff"/>
        <path d="M14 96c0-20 15-30 34-30s34 10 34 30z" fill="#dfe4ff"/>
      </svg>`,
    );

export const WithImage = () => (
  <div className="flex items-center gap-3">
    <Avatar>
      <AvatarImage src={PORTRAIT} alt="Marina Souza" />
      <AvatarFallback>MS</AvatarFallback>
    </Avatar>
    <div className="text-sm">
      <p className="font-medium">Marina Souza</p>
      <p className="text-muted-foreground">Anunciante desde 2023</p>
    </div>
  </div>
);

export const Fallback = () => (
  <div className="flex items-center gap-3">
    <Avatar>
      <AvatarFallback>MS</AvatarFallback>
    </Avatar>
    <Avatar>
      <AvatarFallback>JP</AvatarFallback>
    </Avatar>
    <Avatar>
      <AvatarFallback>TM</AvatarFallback>
    </Avatar>
  </div>
);

export const Sizes = () => (
  <div className="flex items-center gap-3">
    <Avatar className="size-6">
      <AvatarFallback className="text-[10px]">MS</AvatarFallback>
    </Avatar>
    <Avatar>
      <AvatarFallback>MS</AvatarFallback>
    </Avatar>
    <Avatar className="size-12">
      <AvatarFallback>MS</AvatarFallback>
    </Avatar>
  </div>
);
