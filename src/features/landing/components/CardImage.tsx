/**
 * CardImage — a real MTG card face. Fills its container (the `.mb-card` frame the
 * parent applies handles the rounded corners + `overflow: hidden`) with card art
 * from a URL. Pure display: it takes an image, not a card identity — selection is
 * `featuredCards.ts`'s job.
 */
type Props = {
  imageUrl: string;
  alt: string;
};

export function CardImage({ imageUrl, alt }: Props) {
  return (
    <img
      src={imageUrl}
      alt={alt}
      draggable={false}
      className="block h-full w-full object-cover"
    />
  );
}
