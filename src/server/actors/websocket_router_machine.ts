import { WebSocket } from 'ws';
import { createMachine, assign, spawn, send } from 'xstate';
import { LiveViewComponent, LiveViewContext, LiveViewRouter } from '..';
import { sendPhxReply } from '../socket/message_router';
import { newHeartbeatReply, PhxClickPayload, PhxFormPayload, PhxHeartbeatIncoming, PhxIncomingMessage, PhxJoinPayload, PhxSocket, PhxSocketProtocolNames } from '../socket/types';
import { createLiveViewComponentMachine, RequestType } from './component_machine';

export type WebsocketRouterEvent =
  | { type: 'MESSAGE', message: PhxIncomingMessage<unknown> }

export interface WebsocketRouterMachineCtx {
  router: LiveViewRouter
  ws: WebSocket,
  componentMachineRef?: any,
}

export const createWebsocketRouterMachine = (context: WebsocketRouterMachineCtx) => {
  return createMachine<WebsocketRouterMachineCtx, WebsocketRouterEvent>({
    id: 'websocket_router',
    initial: 'ready',
    context,
    // type: 'parallel',
    states: {
      // receives all messages and routes appropriately
      ready: {
        on: {
          MESSAGE: [
            { target: 'unknown', cond: 'isNotValidPhxMessage' },
            { target: 'join', cond: 'isPhxJoinMessage' },
            { target: 'heartbeat', cond: 'isHeartbeatMessage' },
            { target: 'event', cond: 'isEventMessage', },
            { target: 'livePatch', cond: 'isLivePatchMessage' },
            { target: 'unknown' }
          ]
        }
      },
      // processes join message - 1 per websocket connection
      // initializes the LiveViewComponent, Session Data, and PhxSocket
      join: {
        entry: assign({
          componentMachineRef: (context, event) => {
            console.log("join", event)
            // get topic and payload from message
            const topic = event.message[PhxSocketProtocolNames.topic];
            const payload = event.message[PhxSocketProtocolNames.payload] as PhxJoinPayload;

            // extract the url from the payload and use router to get component
            const { url: urlString } = payload;
            const url = new URL(urlString);
            const component = context.router[url.pathname];
            if (!component) {
              throw Error(`no component found for ${url.pathname}`);
            }
            const phxSocket: PhxSocket = {
              id: topic,
              connected: true, // websocket is connected
              ws: context.ws
            };
            // this should kick off initial mount => handleParams => render
            return spawn(createLiveViewComponentMachine({ liveViewComponent: component, requestType: RequestType.websocket, phxSocket }), topic)
          }
        }),
        always: [
          { target: 'ready' }
        ]
      },
      heartbeat: {
        entry: (context, event) => {
          console.log("heartbeat", event)
          const { message } = event;
          const { ws } = context;
          sendPhxReply(ws, newHeartbeatReply(message as PhxHeartbeatIncoming));
        }
      },
      event: {
        entry: (context, event) => {
          console.log("event", event)
          // const [joinRef, messageRef, topic, event, payload] = message;
          const topic = event.message[PhxSocketProtocolNames.topic];
          const payload = event.message[PhxSocketProtocolNames.payload] as PhxClickPayload | PhxFormPayload;
          const componentMachineRef = context.componentMachineRef;
          // componentMachineRef.send({ type: 'event', event, payload });
          const { type, event: payloadEvent, value: payloadValue } = payload;

          // if type === 'click'
          let value = payloadValue;
          if (type === 'form') {
            // @ts-ignore
            value = Object.fromEntries(Object.entries(new URLSearchParams(value)));
          }


          // send handleEvent which should kick off rerender and send back data
          send({
            type: 'handleEvent', event: { payloadEvent, value, socket: { id: topic } }
          }, { to: context.componentMachineRef });

        },
        always: [
          { target: 'ready' }
        ]
      },
      livePatch: {
      },
      unknown: {

      },
      error: {

      },
      done: {
        type: 'final'
      }
    },
  }, {
    actions: {

    },
    guards: {
      isNotValidPhxMessage: (_, event) => {
        const { message } = event;
        return !(typeof message === 'object' && Array.isArray(message) && message.length === 5);
      },
      isPhxJoinMessage: (_, event) => {
        return event.message[PhxSocketProtocolNames.event] === 'phx_join';
      },
      isHeartbeatMessage: (_, event) => {
        return event.message[PhxSocketProtocolNames.event] === 'heartbeat';
      },
      isEventMessage: (_, event) => {
        return event.message[PhxSocketProtocolNames.event] === 'event';
      },
      isLivePatchMessage: (_, event) => {
        return event.message[PhxSocketProtocolNames.event] === 'live_patch';

      },
      isEventTypeClick: (_, event) => {
        console.log('isEventTypeClick', event);
        const payload = event.message[PhxSocketProtocolNames.payload] as PhxClickPayload | PhxFormPayload;
        const { type } = payload;
        return type === 'click';
      },
      isEventTypeForm: (_, event) => {
        console.log('isEventTypeForm', event);
        const payload = event.message[PhxSocketProtocolNames.payload] as PhxClickPayload | PhxFormPayload;
        const { type } = payload;
        return type === 'form';
      },
    },
  })
}
