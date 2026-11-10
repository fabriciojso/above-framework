import forTerminal from 'youch-terminal';
import Youch from 'youch';

export const consoleError = (error: any) => {
  return new Youch(error, {}).toJSON().then((output: any) => {
    console.error(forTerminal(output));
  });
};
