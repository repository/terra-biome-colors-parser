import { render } from "preact";
import { App } from "./app";
import { MantineProvider } from "@mantine/core";
import { NotificationsProvider } from "@mantine/notifications";

render(
  <MantineProvider withNormalizeCSS withGlobalStyles>
    <NotificationsProvider>
      <App />
    </NotificationsProvider>
  </MantineProvider>,
  document.getElementById("app") as HTMLElement,
);
