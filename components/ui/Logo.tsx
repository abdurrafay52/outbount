import { Bai_Jamjuree } from "next/font/google";

const baiJamjuree = Bai_Jamjuree({
  weight: "500",
  subsets: ["latin"],
});

export default function Logo({ className = "" }: { className?: string }) {
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-8 h-8 shrink-0">
        <rect width="32" height="32" rx="8" className="fill-black dark:fill-white" />
        <path d="M10 16L16 10L22 16L16 22L10 16Z" className="fill-white dark:fill-black" />
        <circle cx="16" cy="16" r="2" className="fill-black dark:fill-white" />
      </svg>
      <span className={`text-xl tracking-tight text-black dark:text-white ${baiJamjuree.className}`}>
        Outbount
      </span>
    </div>
  );
}
