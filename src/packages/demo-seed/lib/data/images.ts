import type { CuratedImageSource } from "../../image-source";

type AdImageTarget = {
  kind: "ad";
  adKey: string;
  title: string;
  description: string;
};

type BusinessImageTarget = {
  kind: "business";
  businessKey: string;
};

export interface CuratedDemoImage extends CuratedImageSource {
  target: AdImageTarget | BusinessImageTarget;
}

type Asset = Omit<CuratedImageSource, "key">;

function entry(
  key: string,
  asset: Asset,
  target: CuratedDemoImage["target"],
): CuratedDemoImage {
  return { key, ...asset, target };
}

const assets = {
  interior: {
    url: "https://upload.wikimedia.org/wikipedia/commons/3/3b/Interior.png",
    sha1: "19d47a8018bca7f8941ddf2fb057d5fcacf803e0",
    mimeType: "image/png",
    author: "Jan Křivka",
    license: "Public domain",
    origin: "https://commons.wikimedia.org/wiki/File:Interior.png",
  },
  house: {
    url: "https://upload.wikimedia.org/wikipedia/commons/thumb/3/3b/Old_house_typical_of_the_island_of_Margarita.jpg/960px-Old_house_typical_of_the_island_of_Margarita.jpg",
    sha1: "550cf1a58b7d7f9acfc899bcdf78095e5d84a13b",
    mimeType: "image/jpeg",
    author: "Wilfredor",
    license: "CC0",
    origin: "https://commons.wikimedia.org/wiki/File:Old_house_typical_of_the_island_of_Margarita.jpg",
  },
  garage: {
    url: "https://upload.wikimedia.org/wikipedia/commons/thumb/9/9d/20210609_Garage_Saarbr%C3%BCcken.jpg/960px-20210609_Garage_Saarbr%C3%BCcken.jpg",
    sha1: "5cff1e221dab5472fcb0c1b9aef47f0014b6ae48",
    mimeType: "image/jpeg",
    author: "Flocci Nivis",
    license: "CC BY 4.0",
    origin: "https://commons.wikimedia.org/wiki/File:20210609_Garage_Saarbr%C3%BCcken.jpg",
  },
  hotel: {
    url: "https://upload.wikimedia.org/wikipedia/commons/thumb/3/3e/Hotel_room_%282608760995%29.jpg/960px-Hotel_room_%282608760995%29.jpg",
    sha1: "d49dfb92cee0dd661daee622211a3737e094c0dd",
    mimeType: "image/jpeg",
    author: "donielle",
    license: "CC BY-SA 2.0",
    origin: "https://commons.wikimedia.org/wiki/File:Hotel_room_(2608760995).jpg",
  },
  clutch: {
    url: "https://upload.wikimedia.org/wikipedia/commons/thumb/1/14/Close-up_view_of_a_worn_clutch_disc_among_automotive_tools_in_a_workshop.jpg/960px-Close-up_view_of_a_worn_clutch_disc_among_automotive_tools_in_a_workshop.jpg",
    sha1: "f8840a7edd6561814e4c693ab0434848187898e1",
    mimeType: "image/jpeg",
    author: "Shixart1985",
    license: "CC BY 2.0",
    origin: "https://commons.wikimedia.org/wiki/File:Close-up_view_of_a_worn_clutch_disc_among_automotive_tools_in_a_workshop.jpg",
  },
  bathroom: {
    url: "https://upload.wikimedia.org/wikipedia/commons/5/5a/Bathroom_Renovation.jpg",
    sha1: "ebe2f23778ed2177b0d60be4f26077af4cecf9c8",
    mimeType: "image/jpeg",
    author: "Adamwilliams3421",
    license: "CC BY 4.0",
    origin: "https://commons.wikimedia.org/wiki/File:Bathroom_Renovation.jpg",
  },
  painter: {
    url: "https://upload.wikimedia.org/wikipedia/commons/thumb/e/ef/Modern-Trade-Painter.jpg/960px-Modern-Trade-Painter.jpg",
    sha1: "0acfb260bd30d4c41e727f81a466a93c0280b83f",
    mimeType: "image/jpeg",
    author: "Lukeroberts",
    license: "CC BY-SA 2.5",
    origin: "https://commons.wikimedia.org/wiki/File:Modern-Trade-Painter.jpg",
  },
  airConditioner: {
    url: "https://upload.wikimedia.org/wikipedia/commons/thumb/e/e2/Air_conditioner_2.jpg/960px-Air_conditioner_2.jpg",
    sha1: "8b5b0dd62d2a2d292b48a75f3300ca59c76c9d07",
    mimeType: "image/jpeg",
    author: "Solijon Solayev",
    license: "CC BY-SA 4.0",
    origin: "https://commons.wikimedia.org/wiki/File:Air_conditioner_2.jpg",
  },
  crochet: {
    url: "https://upload.wikimedia.org/wikipedia/commons/c/c7/Crochet_clothes.jpg",
    sha1: "d6e2607a0f8bb741c6a540db0aaf25cbd5ffd9e9",
    mimeType: "image/jpeg",
    author: "EMMA NSHUTI",
    license: "CC0",
    origin: "https://commons.wikimedia.org/wiki/File:Crochet_clothes.jpg",
  },
  photographer: {
    url: "https://upload.wikimedia.org/wikipedia/commons/thumb/1/16/A_PHOTOGRAPHER_AT_WORK.jpg/960px-A_PHOTOGRAPHER_AT_WORK.jpg",
    sha1: "b3478327d04a85a6559946e25b6de03be5655731",
    mimeType: "image/jpeg",
    author: "Valtino44",
    license: "CC BY-SA 4.0",
    origin: "https://commons.wikimedia.org/wiki/File:A_PHOTOGRAPHER_AT_WORK.jpg",
  },
  classroom: {
    url: "https://upload.wikimedia.org/wikipedia/commons/thumb/f/ff/20230709_English_classroom_in_school.jpg/960px-20230709_English_classroom_in_school.jpg",
    sha1: "3051557d266453ec5fe030ae07272f9962ed7e30",
    mimeType: "image/jpeg",
    author: "Orgio89",
    license: "CC0",
    origin: "https://commons.wikimedia.org/wiki/File:20230709_English_classroom_in_school.jpg",
  },
  grooming: {
    url: "https://upload.wikimedia.org/wikipedia/commons/4/47/Dog_Grooming_-_geograph.org.uk_-_6965187.jpg",
    sha1: "d56fc4b496d9d80a381e46a7f4670113a3f94d9c",
    mimeType: "image/jpeg",
    author: "kevin higgins",
    license: "CC BY-SA 2.0",
    origin: "https://commons.wikimedia.org/wiki/File:Dog_Grooming_-_geograph.org.uk_-_6965187.jpg",
  },
  dogFood: {
    url: "https://upload.wikimedia.org/wikipedia/commons/thumb/7/71/Dog_food_in_a_bowl.jpg/960px-Dog_food_in_a_bowl.jpg",
    sha1: "50936a6dd3e78a1b49794fc5365e00b1e3035d0d",
    mimeType: "image/jpeg",
    author: "James Redekop",
    license: "CC BY-SA 2.0",
    origin: "https://commons.wikimedia.org/wiki/File:Dog_food_in_a_bowl.jpg",
  },
} as const satisfies Record<string, Asset>;

const ad = (
  key: string,
  asset: Asset,
  title: string,
  description: string,
) => entry(`ad-${key}`, asset, {
  kind: "ad",
  adKey: key,
  title,
  description,
});

const business = (key: string, asset: Asset) =>
  entry(`profile-${key}`, asset, {
    kind: "business",
    businessKey: key,
  });

export const curatedDemoImages: readonly CuratedDemoImage[] = [
  ad("imperial-kitnet-centro", assets.interior, "Sala da kitnet", "Ambiente interno mobiliado."),
  ad("imperial-apto-granja", assets.interior, "Interior do apartamento", "Sala do apartamento de dois quartos."),
  ad("imperial-sobrado-lagomar", assets.house, "Fachada do sobrado", "Casa com quintal."),
  ad("imperial-vaga-garagem", assets.garage, "Vaga coberta", "Garagem coberta."),
  ad("ilha-diaria-cavaleiros", assets.hotel, "Quarto da pousada", "Quarto preparado para hóspedes."),
  ad("farol-kit-embreagem", assets.clutch, "Kit de embreagem", "Peças automotivas revisadas."),
  ad("cabral-reforma-banheiro", assets.bathroom, "Banheiro em reforma", "Serviço de reforma residencial."),
  ad("cabral-pintura-residencial", assets.painter, "Pintura residencial", "Profissional durante um serviço de pintura."),
  ad("riviera-instalacao-split", assets.airConditioner, "Ar-condicionado split", "Unidade interna instalada."),
  ad("riviera-manutencao-inverno", assets.airConditioner, "Manutenção de ar-condicionado", "Unidade interna de ar-condicionado."),
  ad("carla-blusa-croche", assets.crochet, "Peças de crochê", "Roupas confeccionadas em crochê."),
  ad("carla-porta-copos", assets.crochet, "Trabalho em crochê", "Peças artesanais de crochê."),
  ad("marcos-ensaio-gestante", assets.photographer, "Fotógrafo em ensaio", "Profissional trabalhando em uma sessão externa."),
  ad("juliana-ingles-iniciante", assets.classroom, "Sala de aula", "Ambiente preparado para aulas de idioma."),
  ad("lagoa-banho-tosa", assets.grooming, "Banho e tosa", "Fachada de um serviço de cuidados para cães."),
  ad("lagoa-racao-premium", assets.dogFood, "Ração para cães", "Ração seca servida em uma tigela."),
  business("carla-artesanato", assets.crochet),
  business("marcos-fotografia", assets.photographer),
  business("juliana-idiomas", assets.classroom),
  business("cabral-reformas", assets.painter),
  business("imperial-imoveis", assets.interior),
  business("oficina-farol", assets.clutch),
  business("pousada-da-ilha", assets.hotel),
  business("pet-shop-lagoa", assets.grooming),
  business("riviera-climatizacao", assets.airConditioner),
];
