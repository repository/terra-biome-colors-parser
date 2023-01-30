import {
  Box,
  Button,
  Card,
  Code,
  ColorSwatch,
  Container,
  Divider,
  Group,
  Stack,
  Tabs,
  Text,
  Title,
  Tooltip,
  useMantineTheme,
} from "@mantine/core";
import { Dropzone, DropzoneProps, FileWithPath } from "@mantine/dropzone";
import { showNotification } from "@mantine/notifications";
import { Prism } from "@mantine/prism";
import { createWorkerFactory, useWorker } from "@shopify/react-web-worker";
import { saveAs } from "file-saver";
import { useCallback, useMemo, useState } from "preact/hooks";
import { TbWorldUpload } from "react-icons/tb";
import yaml from "yaml";

const createBiomesWorker = createWorkerFactory(() => import("./parse-biomes"));
const createBluemapZipWorker = createWorkerFactory(() => import("./create-bluemap-zip"));

export function App(props: Partial<DropzoneProps>) {
  const theme = useMantineTheme();
  const biomesWorker = useWorker(createBiomesWorker);
  const bluemapZipWorker = useWorker(createBluemapZipWorker);

  const [pbr, setPbr] = useState<Awaited<ReturnType<(typeof biomesWorker)["parseBiomes"]>> | null>(null);

  const [processing, setProcessing] = useState(false);

  const onFiles = (files: FileWithPath[]) => {
    setProcessing(true);
    const start = performance.now();
    biomesWorker
      .parseBiomes(files)
      .then((pbr) => {
        const time = performance.now() - start;
        setPbr(pbr);

        showNotification({
          title: "Success",
          message: `Parsed ${pbr.biomes.length} biomes in ${time.toFixed(2)}ms`,
          color: "green",
        });
      })
      .catch((error) => {
        showNotification({
          title: "Error",
          message: error.message ?? String(error),
          color: "red",
        });
      })
      .finally(() => {
        setProcessing(false);
      });
  };

  const getBiomeId = useCallback(
    (biomeName: string) => `terra:${pbr?.configId}/${pbr?.configId}/${biomeName}`,
    [pbr?.configId],
  );

  const bluemapJson = useMemo(() => {
    if (!pbr) return "{}";
    return JSON.stringify(Object.fromEntries(pbr.biomes.map(([name, biome]) => [getBiomeId(name), biome])), null, 2);
  }, [getBiomeId, pbr]);

  const squaremapYaml = useMemo(() => {
    const grass: [string, string][] = [];
    const foliage: [string, string][] = [];
    const water: [string, string][] = [];

    for (const [name, biome] of pbr?.biomes ?? []) {
      const id = getBiomeId(name);
      if (biome.grasscolor) grass.push([id, biome.grasscolor]);
      if (biome.foliagecolor) foliage.push([id, biome.foliagecolor]);
      if (biome.watercolor) water.push([id, biome.watercolor]);
    }

    return yaml.stringify({
      "color-overrides": {
        biomes: {
          grass: Object.fromEntries(grass),
          foliage: Object.fromEntries(foliage),
          water: Object.fromEntries(water),
        },
      },
    });
  }, [getBiomeId, pbr]);

  const [downloadProcessing, setDownloadProcessing] = useState(false);
  const downloadBluemapZip = useCallback(async () => {
    setDownloadProcessing(true);
    const blob = await bluemapZipWorker.createBluemapZip(bluemapJson);
    saveAs(blob, pbr?.configId + ".zip");
    setDownloadProcessing(false);
  }, [bluemapJson, bluemapZipWorker, pbr?.configId]);

  return (
    <Container size="lg">
      <Box mt="0.5rem" mb="1rem">
        <Title>Terra Biome Colors Parser</Title>
        <Divider style={{ marginTop: "0.2rem" }} />
      </Box>

      <Dropzone
        loading={processing}
        onDrop={onFiles}
        onReject={(reject) => {
          onFiles(reject.map((r) => r.file));
        }}
        accept={["application/x-zip-compressed"]}
        multiple={false}
        {...props}
        sx={() => ({
          "&[data-reject]": {
            backgroundColor: theme.colors.blue[0],
            borderColor: theme.colors.blue[4],
          },
          marginBottom: "1rem",
        })}
      >
        <Group position="center" spacing="xl" style={{ pointerEvents: "none", minHeight: "8rem" }}>
          <TbWorldUpload size={50} />
          <div>
            <Text size="xl" inline>
              Drag a Terra config zip file or folder here
            </Text>
            <Text size="sm" color="dimmed" inline mt={7}>
              Click to select a zip file
            </Text>
          </div>
        </Group>
      </Dropzone>
      <Group align="flex-start">
        <Stack style={{ width: "30%" }} spacing="xs">
          <Box>
            <Text size="sm" weight={600}>
              Biomes ({pbr?.biomes.length ?? "0"})
            </Text>
            <Divider style={{ marginTop: "0.2rem" }} />
          </Box>
          {pbr?.biomes.map(([id, biome]) => (
            <Card key={id} withBorder shadow="sm" radius="md" p="sm">
              <Card.Section withBorder inheritPadding py="sm">
                <Text
                  size="sm"
                  sx={{
                    fontFamily: theme.fontFamilyMonospace,
                    lineHeight: 1,
                  }}
                >
                  {id}
                </Text>
              </Card.Section>

              <Group style={{ marginTop: 8 }} position="apart">
                <Stack spacing={2}>
                  <Text size="sm" weight={600}>
                    Colors
                  </Text>
                  <Group spacing={4}>
                    <Tooltip label="Foliage" withArrow>
                      <ColorSwatch color={biome.foliagecolor ?? "#00000000"} />
                    </Tooltip>
                    <Tooltip label="Grass" withArrow>
                      <ColorSwatch color={biome.grasscolor ?? "#00000000"} />
                    </Tooltip>
                    <Tooltip label="Water" withArrow>
                      <ColorSwatch color={biome.watercolor ?? "#00000000"} />
                    </Tooltip>
                  </Group>
                </Stack>
                <Group>
                  <Stack spacing={2}>
                    <Text size="sm" weight={600}>
                      Temperature
                    </Text>
                    <Text size="sm">{biome.temperature ?? "Unset"}</Text>
                  </Stack>
                  <Stack spacing={2}>
                    <Text size="sm" weight={600}>
                      Humidity
                    </Text>
                    <Text size="sm">{biome.humidity ?? "Unset"}</Text>
                  </Stack>
                </Group>
              </Group>
            </Card>
          ))}
        </Stack>
        <Tabs defaultValue="bluemap" sx={{ flexGrow: 1 }}>
          <Tabs.List>
            <Tabs.Tab value="bluemap">BlueMap</Tabs.Tab>
            <Tabs.Tab value="squaremap">squaremap</Tabs.Tab>
          </Tabs.List>

          <Tabs.Panel value="bluemap">
            <Stack spacing="xs">
              <Stack spacing={0}>
                <Button mt="sm" disabled={pbr === null} onClick={downloadBluemapZip} loading={downloadProcessing}>
                  Download Resource Pack
                </Button>
                <Text size="sm">
                  Place the resource pack in your{" "}
                  <Code style={{ color: theme.colors.red[5] }}>config/bluemap/resourcepacks/</Code> folder
                </Text>
              </Stack>
              <Stack spacing={2}>
                <Text size="sm" weight={600}>
                  biomes.json
                </Text>
                <Prism
                  language="json"
                  sx={{
                    border: "1px solid #eaeaea",
                    borderRadius: "4px",
                  }}
                >
                  {bluemapJson}
                </Prism>
              </Stack>
            </Stack>
          </Tabs.Panel>

          <Tabs.Panel value="squaremap">
            <Stack spacing={2} mt={12}>
              <Text size="sm">
                Set the <Code style={{ color: theme.colors.red[5] }}>color-overrides</Code> property in your{" "}
                <Code style={{ color: theme.colors.red[5] }}>advanced.yml</Code> file to the following:
              </Text>
              <Prism
                language="yaml"
                sx={{
                  border: "1px solid #eaeaea",
                  borderRadius: "4px",
                }}
              >
                {squaremapYaml}
              </Prism>
            </Stack>
          </Tabs.Panel>
        </Tabs>
      </Group>
    </Container>
  );
}
