import boxen from 'boxen';
import chalk from 'chalk';

interface OptionsContract<T> {
  required?: boolean;
  description?: string;
  defaultValue?: T;
}

class EnvManager {
  public static get<T>(name: string, options?: OptionsContract<T>): T {
    const env = process.env[name] as any;
    if (options && options.required && !env) {
      console.error(
        boxen(`A variavel de ambiente ${chalk.bold.redBright(name)} não foi encontrado!`, {
          padding: 1,
        }),
      );
    }
    if (env === 'true' || env === 'false') {
      return (env === 'true') as unknown as T;
    }
    if (env && !Number.isNaN(Number(env))) {
      return parseInt(String(env), 10) as unknown as T;
    }
    if (env === undefined && options && options.defaultValue !== undefined) {
      return options.defaultValue;
    }
    return env;
  }
}

export default EnvManager;
