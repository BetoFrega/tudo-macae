interface ImageLoaderProps {
  src: string;
  width: number;
  quality?: number | undefined;
}

export default function imageLoader(props: ImageLoaderProps): string;
