import pino from "pino";

const logger = pino({
  transport: {
    target: "pino-pretty",
    options: {
      colorize: true,
      translateTime: "SYS:HH:MM:ss",
      ignore: "pid,hostname",
      singleLine: true,
    },
  },
  level: process.env.LOG_LEVEL || "info",
});

export default logger;

export function createLogger(component) {
  return logger.child({ component });
}
