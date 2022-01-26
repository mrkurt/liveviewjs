import { createMachine, assign } from 'xstate';
import { LiveViewComponent, LiveViewContext } from '..';
import { PhxSocket } from '../socket/types';

export enum RequestType {
  http = 'http',
  websocket = 'websocket'
}

export interface ComponentMachineCtx {
  requestType: RequestType
  liveViewComponent: LiveViewComponent<any>
  phxSocket: PhxSocket
  liveViewContext?: LiveViewContext<any>
}

export const createLiveViewComponentMachine = (context: ComponentMachineCtx) => {
  return createMachine<ComponentMachineCtx>({
    id: 'component',
    initial: 'mount',
    context,
    states: {
      mount: {
        // entry: ['mountComponent'],
        invoke: {
          id: 'mountComponent',
          src: async (context, event) => {
            console.log("mount", context, event)
            // TODO session
            return Promise.resolve(context.liveViewComponent.mount(context.liveViewContext, {}, context.phxSocket));
          },
          onDone: {
            target: 'handleParams',
            actions: assign({ liveViewContext: (_, event) => event.data })
          },
          onError: {
            target: 'error',
          }
        },
      },
      handleParams: {
        invoke: {
          id: 'handleParams',
          src: async (context, event) => {
            console.log("handleParams", context, event)
            // @ts-ignore
            if (context.liveViewContext.handleParams) {
              // @ts-ignore
              return Promise.resolve(context.liveViewContext.handleParams(context.liveViewContext, event.data));
            }
            return Promise.resolve(() => { });
          },
          onDone: {
            target: 'handleParams',
            actions: assign({ liveViewContext: (context, event) => event.data ? event.data : context.liveViewContext })
          },
          onError: {
            target: 'error',
          }
        },
      },
      render: {
        entry: ['execRender'],
        always: [
          { target: 'transitionToRequestTypeLifeCycle', cond: 'didRenderSucceed' },
          { target: 'error', cond: 'didRenderFail' }
        ]
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
        entry: ['handleError'],
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
      }),
      handleError: (context, event) => {
        console.log("error", context, event);
      }
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
