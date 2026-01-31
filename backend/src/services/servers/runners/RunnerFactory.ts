import { IServerRunner } from './IServerRunner';
import { NativeRunner } from './NativeRunner';
import { DockerRunner } from './DockerRunner';

class RunnerFactory {
    private nativeRunner: NativeRunner = new NativeRunner();
    private dockerRunner: DockerRunner = new DockerRunner();

    getRunner(engine: 'native' | 'docker' = 'native'): IServerRunner {
        if (engine === 'docker') {
            return this.dockerRunner;
        }
        return this.nativeRunner;
    }

    // Helpers to get all runners for clean up or broad actions
    getAllRunners(): IServerRunner[] {
        return [this.nativeRunner, this.dockerRunner];
    }
}

export const runnerFactory = new RunnerFactory();
