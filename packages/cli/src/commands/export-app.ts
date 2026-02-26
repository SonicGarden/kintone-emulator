import { KintoneRestAPIClient } from "@kintone/rest-api-client";

interface ExportAppOptions {
  baseUrl: string;
  username: string;
  password: string;
  app: string;
}

export async function exportApp(options: ExportAppOptions): Promise<void> {
  const client = new KintoneRestAPIClient({
    baseUrl: options.baseUrl,
    auth: {
      username: options.username,
      password: options.password,
    },
  });

  const appId = options.app;
  if (!/^\d+$/.test(appId)) {
    throw new Error(`Invalid app ID: "${appId}". Must be a positive integer.`);
  }

  const [appInfo, formFields, formLayout, processManagement, allRecords] =
    await Promise.all([
      client.app.getApp({ id: appId }),
      client.app.getFormFields({ app: appId }),
      client.app.getFormLayout({ app: appId }),
      client.app.getProcessManagement({ app: appId }),
      client.record.getAllRecords({ app: appId }),
    ]);

  const records = allRecords.map(({ $revision: _, ...rest }) => rest);

  const output = {
    id: appId,
    name: appInfo.name,
    properties: formFields.properties,
    layout: formLayout.layout,
    status: {
      enable: processManagement.enable,
      states: processManagement.states,
      actions: processManagement.actions,
    },
    ...(records.length > 0 && { records }),
  };

  console.log(JSON.stringify(output, null, 2));
}
