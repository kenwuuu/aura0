import { CardImages, CardImageUris } from '@/features/player/types';

export type ScryfallCard = {
  id: string;
  name: string;
  type_line?: string;
  image_uris?: CardImageUris;
  oracle_text?: string;
  card_faces?: Array<{
    image_uris?: CardImageUris;
  }>;
  all_parts?: Array<{
    id: string;
    component: string;
    name: string;
    type_line?: string;
    uri: string;
  }>;
};

export type CardDataResult = {
  count: number;
  name: string;
  type_line?: string;
  oracleText?: string;
  scryfallId: string;
  imageUris: CardImages;
  error?: string;
};
