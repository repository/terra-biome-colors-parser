import { downloadZip as createZip } from "client-zip";

export const createBluemapZip = async (json: string) => {
  const blob = await createZip([
    {
      name: "assets/terra/biomes.json",
      input: json,
      lastModified: new Date(),
    },
  ]).blob();

  return blob;
};
