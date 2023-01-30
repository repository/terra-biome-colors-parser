import type { FileWithPath } from "@mantine/dropzone";
import { ZipEntry, unzip } from "unzipit";
import { parse as parseYaml } from "yaml";
import escapeStringRegexp from "escape-string-regexp";
import { vanillaBiomes } from "./vanilla-biomes";

export interface ProcessedBiome {
  watercolor?: string;
  foliagecolor?: string;
  grasscolor?: string;
  humidity?: number;
  temperature?: number;
}

interface UnprocessedBiome extends ProcessedBiome {
  id: string;
  abstract: boolean;
  extends?: string[];
  resolved: boolean;
}

type RawColor = string | number;
interface RawTerraBiome {
  type: "BIOME";
  id: string;
  abstract?: boolean;
  vanilla?: string;
  extends?: string | string[];
  colors?: {
    foliage?: RawColor;
    grass?: RawColor;
    water?: RawColor;
  };
}

const yamlRegex = /\.ya?ml$/;
const isYamlFile = (filename: string) => yamlRegex.test(filename);
const isStringNotEmpty = (value: unknown): value is string => {
  return typeof value === "string" && value.length > 0;
};
const assertStringOrNumber = (value: unknown): value is string | number => {
  return typeof value === "string" || typeof value === "number";
};
const assertTerraBiome = (value: unknown): value is RawTerraBiome => {
  const biome = value as RawTerraBiome;

  return (
    typeof biome === "object" &&
    biome !== null &&
    biome.type === "BIOME" &&
    isStringNotEmpty(biome.id) &&
    (biome.abstract === undefined || typeof biome.abstract === "boolean") &&
    (biome.vanilla === undefined || isStringNotEmpty(biome.vanilla)) &&
    (biome.extends === undefined || isStringNotEmpty(biome.extends) || Array.isArray(biome.extends)) &&
    (biome.colors === undefined ||
      (typeof biome.colors === "object" &&
        biome.colors !== null &&
        (biome.colors.foliage === undefined ||
          (assertStringOrNumber(biome.colors.foliage) &&
            (biome.colors.grass === undefined ||
              (assertStringOrNumber(biome.colors.grass) &&
                (biome.colors.water === undefined || assertStringOrNumber(biome.colors.water))))))))
  );
};
const normalizeYamlPath = (path: string) => {
  path = path.replace(/\\/g, "/").replace(yamlRegex, "");
  return path.startsWith("/") ? path : "/" + path;
};
const assertFulfilled = <T>(item: PromiseSettledResult<T>): item is PromiseFulfilledResult<T> => {
  return item.status === "fulfilled";
};
const mapFilter = <T, U>(values: Iterable<T>, map: (value: T) => U | undefined | void): U[] => {
  const results = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (let value of values as Iterable<any>) {
    value = map(value);
    if (value !== undefined) {
      results.push(value);
    }
  }
  return results;
};
const toHexOrUndefined = (color: unknown) =>
  typeof color === "string" ? color : typeof color === "number" ? "#" + color.toString(16).padStart(6, "0") : undefined;

export const parseBiomes = async (inputFiles: FileWithPath[]) => {
  let unparsedYamlFiles: [string, FileWithPath | ZipEntry][];

  if (inputFiles.length <= 0) {
    throw new Error("Invalid input: no files");
  } else if (inputFiles.length === 1) {
    const inputFile = inputFiles[0];
    if (["application/x-zip-compressed", "application/zip"].includes(inputFile.type)) {
      const { entries } = await unzip(inputFile);
      unparsedYamlFiles = Object.entries(entries).filter(([, file]) => isYamlFile(file.name));
    } else {
      throw new Error("Invalid input: not a zip file");
    }
  } else {
    unparsedYamlFiles = mapFilter(inputFiles, (file) =>
      isYamlFile(file.name) ? ([file.path, file] as [string, FileWithPath]) : undefined,
    );
  }

  const parseYamlPromise = await Promise.allSettled(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    unparsedYamlFiles.map<Promise<[string, any]>>(async ([path, file]) => {
      const text = await file.text();
      return [normalizeYamlPath(path), parseYaml(text)];
    }),
  );

  const parsedYamlFiles = mapFilter(parseYamlPromise, (result) => (assertFulfilled(result) ? result.value : undefined));

  const packFiles = parsedYamlFiles.filter(([path]) => path.endsWith("/pack"));

  if (packFiles.length === 0) {
    throw new Error("Invalid Terra config: no pack.yml file found");
  } else if (packFiles?.length > 1) {
    throw new Error("Invalid Terra config: found multiple pack.yml files");
  }

  const packFile = packFiles[0];
  const basePath = packFile[0].replace(/\/pack$/, "");
  const basePathRegex = new RegExp("^" + escapeStringRegexp(basePath));

  const configId: string = packFile[1]?.id?.toLowerCase();

  if (!isStringNotEmpty(configId)) {
    throw new Error("Invalid Terra config: pack.yml file has no id");
  }

  const yamlFilesInScope = mapFilter(parsedYamlFiles, ([path, data]) =>
    basePathRegex.test(path) ? ([path.replace(basePathRegex, ""), data] as const) : undefined,
  );

  const unparsedBiomes = mapFilter(yamlFilesInScope, ([, data]) => (assertTerraBiome(data) ? data : undefined));

  const unprocessedBiomes = new Map<string, UnprocessedBiome>();

  for (const biome of unparsedBiomes) {
    const { id, abstract, vanilla, extends: extendsBiomes, colors } = biome;

    const vanillaBiome = vanilla ? vanillaBiomes[vanilla] : undefined;

    const parsedBiome: UnprocessedBiome = {
      id,
      abstract: abstract ?? false,
      extends: Array.isArray(extendsBiomes) ? extendsBiomes : extendsBiomes ? [extendsBiomes] : [],
      resolved: false,
      watercolor: toHexOrUndefined(colors?.water) ?? vanillaBiome?.watercolor,
      foliagecolor: toHexOrUndefined(colors?.foliage) ?? vanillaBiome?.foliagecolor,
      grasscolor: toHexOrUndefined(colors?.grass) ?? vanillaBiome?.grasscolor,
      temperature: vanillaBiome?.temperature,
      humidity: vanillaBiome?.humidity,
    };

    unprocessedBiomes.set(id, parsedBiome);
  }

  const resolveBiome = (input: string | UnprocessedBiome): UnprocessedBiome => {
    let biome = typeof input === "string" ? unprocessedBiomes.get(input) : input;

    if (!biome) {
      throw new Error(
        "Error while resolving biomes: biome not found" + (typeof input === "string" ? ": " + input : ""),
      );
    }

    if (biome.resolved) {
      return biome;
    }

    if (Array.isArray(biome.extends) && biome.extends.length > 0) {
      biome = mapFilter(biome.extends, (bid) => unprocessedBiomes.get(bid))
        .map(resolveBiome)
        .reduceRight<UnprocessedBiome>(
          (base, ext) => ({
            id: base.id,
            abstract: base.abstract,
            humidity: ext.humidity ?? base.humidity,
            temperature: ext.temperature ?? base.temperature,
            watercolor: ext.watercolor ?? base.watercolor,
            foliagecolor: ext.foliagecolor ?? base.foliagecolor,
            grasscolor: ext.grasscolor ?? base.grasscolor,
            resolved: base.resolved,
          }),
          biome,
        );
    }

    biome.resolved = true;
    unprocessedBiomes.set(biome.id, biome);

    return biome;
  };

  const resolvedBiomes = mapFilter(unprocessedBiomes.entries(), ([id, biome]) =>
    biome.abstract ? undefined : ([id.toLowerCase(), resolveBiome(biome)] as const),
  );

  const processedBiomes = resolvedBiomes.map<[string, ProcessedBiome]>(([id, biome]) => [
    id,
    {
      watercolor: biome.watercolor,
      foliagecolor: biome.foliagecolor,
      grasscolor: biome.grasscolor,
      temperature: biome.temperature,
      humidity: biome.humidity,
    },
  ]);

  return {
    configId,
    biomes: processedBiomes,
  };
};
