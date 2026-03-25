import { IServerRunner } from './IServerRunner';
import { NativeRunner } from './NativeRunner';
import { DockerRunner } from './DockerRunner';
import { RemoteRunner } from './RemoteRunner';

class RunnerFactory {
    private nativeRunner: NativeRunner = new NativeRunner();
    private dockerRunner: DockerRunner = new DockerRunner();
    private remoteRunner: RemoteRunner = new RemoteRunner();

    getRunner(engine: 'native' | 'docker' | 'remote' = 'native'): IServerRunner {
        if (engine === 'docker') {
            return this.dockerRunner;
        }
        if (engine === 'remote') {
            return this.remoteRunner;
        }
        return this.nativeRunner;
    }

    getRemoteRunner(): RemoteRunner {
        return this.remoteRunner;
    }

    // Helpers to get all runners for clean up or broad actions
    getAllRunners(): IServerRunner[] {
        return [this.nativeRunner, this.dockerRunner, this.remoteRunner];
    }
}

export const runnerFactory = new RunnerFactory();
