import { createMachine, assign } from 'xstate';
import { LiveViewComponent, LiveViewContext } from '..';
import { PhxSocket } from '../socket/types';

export enum RequestType {
  http = 'http',
  websocket = 'websocket'
}

export interface ComponentMachineCtx {
  requestType: RequestType;
  liveViewComponent: LiveViewComponent<any>
  liveViewContext?: LiveViewContext<any>
  phxSocket?: PhxSocket
}

export const createLiveViewComponentMachine = (context: ComponentMachineCtx) => {
  return createMachine<ComponentMachineCtx>({
    id: 'component',
    initial: 'mount',
    context,
    states: {
      mount: {
        entry: ['mountComponent'],
        on: {
          '': [
            { target: 'handleParams', cond: 'didMountSucceed' },
            { target: 'error', cond: 'didMountFail' }
          ]
        },
      },
      handleParams: {
        entry: ['execHandleParams'],
        on: {
          '': [
            { target: 'render', cond: 'didHandleParamsSucceed' },
            { target: 'error', cond: 'didHandleParamsFail' }
          ]
        },
      },
      render: {
        entry: ['execRender'],
        on: {
          '': [
            { target: 'transitionToRequestTypeLifeCycle', cond: 'didRenderSucceed' },
            { target: 'error', cond: 'didRenderFail' }
          ]
        },
      },
      // if http request, transition to done
      // if websocket, transition to readyForEvents
      transitionToRequestTypeLifeCycle: {
        always: [
          { target: 'readyForEvents', cond: 'isRequestTypeWebsocket' },
          { target: 'done', cond: 'isRequestTypeHttp' }
        ]
      },
      readyForEvents: {
        type: 'parallel',
        states: {
          handleParams: {
            on: {
              HANDLE_PARAMS: {
                actions: ['handleParams'],
                target: 'handleParams'
              }
            }
          },
          handleInfo: {
          },
          handleEvents: {
          },
          heartbeat: {
            // when heartbeat timeout fails, move to done
          }
        },
      },
      error: {

      },
      done: {
        // cleanup
        type: 'final',
      },
    }
  }, {
    actions: {
      mountComponent: assign((context, event) => {
        console.log('mounting component...');
        const liveViewContext = context.liveViewComponent.mount({}, {}, { id: 'phx-socket-id', connected: false });
        return {
          liveViewComponent: context.liveViewComponent,
          liveViewContext,
        };
      }),
      execHandleParams: assign((context, event) => {
        console.log('executing handleParams...');

        let liveViewContext = context.liveViewContext;
        if (Object.getOwnPropertyNames(context.liveViewComponent).includes('handleParams')) {
          // @ts-ignore
          const newCtx = context.liveViewComponent.handleParams({}, {}, { id: 'phx-socket-id', connected: false });
          liveViewContext = { ...liveViewContext, ...newCtx };
        }
        return {
          liveViewComponent: context.liveViewComponent,
          liveViewContext,
        }
      }),
      execRender: assign((context, event) => {
        console.log('executing render...');
        context.liveViewComponent.render(context.liveViewContext!);
        // send render to parent caller?
        return {
          liveViewComponent: context.liveViewComponent
        };
      })
    },
    guards: {
      didMountSucceed: (context, event) => {
        return true;
      },
      didMountFail: (context, event) => {
        return false;
      },
      didHandleParamsSucceed: (context, event) => {
        return true;
      },
      didHandleParamsFail: (context, event) => {
        return false;
      },
      didRenderSucceed: (context, event) => {
        return true;
      },
      didRenderFail: (context, event) => {
        return false;
      },
      isRequestTypeHttp: (context, event) => {
        return context.requestType === RequestType.http;
      },
      isRequestTypeWebsocket: (context, event) => {
        return context.requestType === RequestType.websocket;
      }
    },
  })
}
