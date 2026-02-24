export const getHost = (): string =>
  `localhost:${process.env.TEST_PORT ?? "12345"}`;
