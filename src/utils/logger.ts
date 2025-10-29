const COLORS = {
  reset: '\x1b[0m',
  gray: '\x1b[90m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
};

function ts(): string {
  const d = new Date();
  return d.toISOString();
}

function line(prefix: string, message: string) {
  // eslint-disable-next-line no-console
  console.log(`${COLORS.gray}[${ts()}]${COLORS.reset} ${prefix} ${message}`);
}

export const logger = {
  info(message: string) {
    line(`${COLORS.cyan}INFO${COLORS.reset}`, message);
  },
  warn(message: string) {
    line(`${COLORS.yellow}WARN${COLORS.reset}`, message);
  },
  error(message: string) {
    line(`${COLORS.red}ERROR${COLORS.reset}`, message);
  },
  section(title: string) {
    const bar = `${COLORS.magenta}==============================${COLORS.reset}`;
    // eslint-disable-next-line no-console
    console.log(`${bar}\n${COLORS.magenta}${title}${COLORS.reset}\n${bar}`);
  },
  json(title: string, obj: unknown) {
    this.info(`${title}:\n${COLORS.gray}${JSON.stringify(obj, null, 2)}${COLORS.reset}`);
  },
};


