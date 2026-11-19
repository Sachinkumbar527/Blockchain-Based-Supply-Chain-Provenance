import { useState } from 'react';
import { PackageCheck } from 'lucide-react';

interface ProductImageProps {
  src: string;
  alt: string;
  title?: string;
  className?: string;
}

export function ProductImage({ src, alt, title, className = '' }: ProductImageProps) {
  const [failed, setFailed] = useState(false);

  if (failed || !src) {
    return (
      <div
        className={`flex flex-col items-center justify-center bg-slate-100 text-slate-500 border border-slate-200 ${className}`}
        role="img"
        aria-label={alt}
      >
        <PackageCheck className="w-7 h-7 text-teal-700 mb-2" strokeWidth={1.5} />
        <span className="text-xs font-medium text-slate-600 px-3 text-center truncate max-w-full">
          {title ?? alt}
        </span>
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className={`object-cover bg-slate-100 ${className}`}
    />
  );
}
