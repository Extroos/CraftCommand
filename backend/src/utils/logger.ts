
import chalk from 'chalk';

class Logger {
    private getTimestamp() {
        // DD/MM/YYYY HH:MM:SS
        const now = new Date();
        const date = now.toLocaleDateString('en-GB'); // DD/MM/YYYY
        const time = now.toLocaleTimeString('en-GB', { hour12: false });
        return `${date} ${time}`;
    }

    private format(level: string, message: string) {
        return `[+] CraftCommand: ${this.getTimestamp()} - ${level}: ${message}`;
    }

    info(message: string) {
        console.log(chalk.white(this.format('INFO', message)));
    }

    success(message: string) {
        console.log(chalk.green(this.format('SUCCESS', message)));
    }

    warn(message: string) {
        console.log(chalk.yellow(this.format('WARNING', message)));
    }

    error(message: string) {
        console.log(chalk.red(this.format('ERROR', message)));
    }

    // For raw output (like banner)
    raw(message: string) {
        console.log(message);
    }
}

export const logger = new Logger();
