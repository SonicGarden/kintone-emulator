import { Command } from "commander";
import { exportApp } from "./commands/export-app";

const program = new Command();

program
  .name("kintone-emulator")
  .description("CLI tools for kintone-emulator");

program
  .command("export-app")
  .description(
    "Export app definition from a kintone environment for use with setup/app.json"
  )
  .requiredOption("--base-url <url>", "kintone base URL (e.g. https://example.cybozu.com)")
  .requiredOption("--username <username>", "Login username")
  .requiredOption("--password <password>", "Login password")
  .requiredOption("--app <appId>", "App ID to export")
  .action(async (options: { baseUrl: string; username: string; password: string; app: string }) => {
    try {
      await exportApp(options);
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  });

program.parse();
