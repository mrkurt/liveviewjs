import { PhxReply, PhxSocketProtocolNames, RenderedNode, PhxOutgoingMessage, newHeartbeatReply, PhxJoinIncoming, PhxHeartbeatIncoming, PhxClickEvent, PhxFormEvent, PhxIncomingMessage, PhxClickPayload, PhxFormPayload, PhxSocket, PhxDiffReply, PhxLivePatchIncoming } from './types';
import WebSocket from 'ws';
import http, { Server, createServer } from 'http';
// import { router } from '../live/router';
import { URLSearchParams } from 'url';
import { LiveViewComponent } from '../types';
import { LiveViewRouter } from '../types';

export function onMessage(ws: WebSocket, message: WebSocket.RawData, topicToPath: { [key: string]: string }, router: LiveViewRouter) {

  console.log("message", String(message));
  // get raw message to string
  const stringMsg = message.toString();
  // console.log("message", stringMsg);

  // parse string to JSON
  const rawPhxMessage: PhxIncomingMessage<unknown> = JSON.parse(stringMsg);
  // console.log("rawPhxMessage", rawPhxMessage);

  // rawPhxMessage must be an array with 5 elements
  if (typeof rawPhxMessage === 'object' && Array.isArray(rawPhxMessage) && rawPhxMessage.length === 5) {
    const [joinRef, messageRef, topic, event, payload] = rawPhxMessage;
    switch (event) {
      case "phx_join":
        onPhxJoin(ws, rawPhxMessage as PhxJoinIncoming, topicToPath, router);
        break;
      case "heartbeat":
        onHeartbeat(ws, rawPhxMessage as PhxHeartbeatIncoming, topicToPath, router);
        break;
      case "event":
        // map based on event type
        const { type } = payload as PhxClickPayload | PhxFormPayload
        console
        switch (type) {
          case "click":
            onPhxClickEvent(ws, rawPhxMessage as PhxClickEvent, topicToPath, router);
            break;
          case "form":
            onPhxFormEvent(ws, rawPhxMessage as PhxFormEvent, topicToPath, router);
            break;
          default:
            console.error("unhandeded event type", type);
        }
        break;
      case "live_patch":
        onPhxLivePatch(ws, rawPhxMessage as PhxLivePatchIncoming, topicToPath, router);
        break;
      default:
        console.error("unhandeded protocol event", event);
    }
  }
  else {
    // unknown message type
    console.error("unknown message type", rawPhxMessage);
  }
}

export function onPhxJoin(ws: WebSocket, message: PhxJoinIncoming, topicToPath: { [key: string]: string }, router: LiveViewRouter) {
  // console.log("phx_join", message);

  // use url to route join request to component
  const [joinRef, messageRef, topic, event, payload] = message;
  const url = new URL(payload.url);
  // @ts-ignore - searchParams returns an entries but types are wrong
  const params = Object.fromEntries(url.searchParams);
  const component = router[url.pathname];
  if (!component) {
    console.error("no component found for", url);
    return;
  }

  // update topicToPath
  topicToPath[topic] = url.pathname;

  const phxSocket: PhxSocket = {
    id: topic,
    connected: true, // websocket is connected
    ws,
  }




  let ctx = component.mount({}, {}, phxSocket);

  // check if component has event handler
  // this type of message goes to handleParams
  if ((component as any).handleParams) {
    // @ts-ignore
    ctx = component.handleParams(params, url, { id: topic });
  }


  const view = component.render(ctx);

  // map array of dynamics to object with indiceies as keys
  const dynamics = view.dynamics.reduce((acc: { [key: number]: unknown }, cur, index: number) => {
    acc[index] = cur;
    return acc;
  }, {} as { [key: number]: unknown })

  const rendered: RenderedNode = {
    ...dynamics,
    s: view.statics
  }

  const reply: PhxReply = [
    message[0],
    message[1],
    message[2],
    "phx_reply",
    {
      response: {
        rendered
      },
      status: "ok"
    }
  ]

  const statics = rendered.s;
  let html = statics[0];
  for (let i = 1; i < statics.length; i++) {
    html += rendered[i - 1] + statics[i];
  }

  // console.log(html)
  // console.log("sending phx_reply", reply);
  ws.send(JSON.stringify(reply), { binary: false }, (err: any) => {
    if (err) {
      console.error("error", err)
    }
  });
}

export function onPhxLivePatch(ws: WebSocket, message: PhxLivePatchIncoming, topicToPath: { [key: string]: string }, router: LiveViewRouter) {
  // update context
  // rerun render
  // send back dynamics if they changed
  // console.log('socket:', socket);
  console.log('onPhxLivePatch event:', message);

  const [joinRef, messageRef, topic, event, payload] = message;

  // route using topic to lookup path
  const path = topicToPath[topic];
  const component = router[path];
  if (!component) {
    console.error("no mapping found topic", topic);
    return;
  }

  // check if component has event handler
  // this type of message goes to handleParams
  if (!(component as any).handleParams) {
    console.warn("no event handler for component", component);
    return;
  }

  const { url } = payload;
  const parsedUrl = new URL(url);

  // @ts-ignore - searchParams returns an entries but types are wrong
  const params = Object.fromEntries(parsedUrl.searchParams);
  // TODO update types to have optional handleEvent???
  // alternatively have a abstract class defining empty handleParams?
  // @ts-ignore
  const ctx = component.handleParams(params, url, { id: topic });

  const view = component.render(ctx);

  // map array of dynamics to object with indiceies as keys
  const dynamics = view.dynamics.reduce((acc: { [key: number]: string }, cur: string, index: number) => {
    acc[index] = cur;
    return acc;
  }, {} as { [key: string]: string })

  const reply: PhxReply = [
    message[0],
    message[1],
    message[2],
    "phx_reply",
    {
      response: {
        diff: {
          ...dynamics
        }
      },
      status: "ok"
    }
  ]
  console.log("sending phx_reply", reply);
  ws.send(JSON.stringify(reply), { binary: false }, (err: any) => {
    if (err) {
      console.error("error", err)
    }
  });
}

export function onPhxFormEvent(ws: WebSocket, message: PhxFormEvent, topicToPath: { [key: string]: string }, router: LiveViewRouter) {
  // update context
  // rerun render
  // send back dynamics if they changed
  // console.log('socket:', socket);
  console.log('onPhxFormEvent event:', message);

  const [joinRef, messageRef, topic, event, payload] = message;

  // route using topic to lookup path
  const path = topicToPath[topic];
  const component = router[path];
  if (!component) {
    console.error("no mapping found topic", topic);
    return;
  }

  // check if component has event handler
  if (!(component as any).handleEvent) {
    console.warn("no event handler for component", component);
    return;
  }

  const { type, event: payloadEvent, value } = payload;
  const params = new URLSearchParams(value);
  // TODO update types to have optional handleEvent???
  // @ts-ignore
  const ctx = component.handleEvent(payload.event, Object.fromEntries(params), { id: topic });

  const view = component.render(ctx);

  // map array of dynamics to object with indiceies as keys
  const dynamics = view.dynamics.reduce((acc: { [key: number]: string }, cur: string, index: number) => {
    acc[index] = cur;
    return acc;
  }, {} as { [key: string]: string })

  const reply: PhxReply = [
    message[0],
    message[1],
    message[2],
    "phx_reply",
    {
      response: {
        diff: {
          ...dynamics
        }
      },
      status: "ok"
    }
  ]
  console.log("sending phx_reply", reply);
  ws.send(JSON.stringify(reply), { binary: false }, (err: any) => {
    if (err) {
      console.error("error", err)
    }
  });
}

export function onPhxClickEvent(ws: WebSocket, message: PhxClickEvent, topicToPath: { [key: string]: string }, router: LiveViewRouter) {
  // update context
  // rerun render
  // send back dynamics if they changed
  // console.log('socket:', socket);
  console.log('event:', message);

  const [joinRef, messageRef, topic, event, payload] = message;

  // route using topic to lookup path
  const path = topicToPath[topic];
  const component = router[path];
  if (!component) {
    console.error("no mapping found topic", topic);
    return;
  }

  // check if component has event handler
  if (!(component as any).handleEvent) {
    console.warn("no event handler for component", component);
    return;
  }

  const { type, event: payloadEvent, value } = payload;
  // TODO update types to have optional handleEvent???
  // @ts-ignore
  const ctx = component.handleEvent(payloadEvent, value, { id: topic });

  const view = component.render(ctx);

  // map array of dynamics to object with indiceies as keys
  const dynamics = view.dynamics.reduce((acc: { [key: number]: string }, cur: string, index: number) => {
    acc[index] = cur;
    return acc;
  }, {} as { [key: string]: string })

  const reply: PhxReply = [
    message[0],
    message[1],
    message[2],
    "phx_reply",
    {
      response: {
        diff: {
          ...dynamics
        }
      },
      status: "ok"
    }
  ]
  // console.log("sending phx_reply", reply);
  ws.send(JSON.stringify(reply), { binary: false }, (err: any) => {
    if (err) {
      console.error("error", err)
    }
  });
}

// @OnDisconnect()
// disconnect(@ConnectedSocket() socket: any) {
//   console.log('client disconnected');
// }
// }

export function onHeartbeat(ws: WebSocket, message: PhxHeartbeatIncoming, topicToPath: { [key: string]: string }, router: LiveViewRouter) {
  // console.log("heartbeat", message);

  const hbReply = newHeartbeatReply(message);

  // console.log("sending hbReply", hbReply);
  ws.send(JSON.stringify(hbReply), { binary: false }, (err: any) => {
    if (err) {
      console.error("error", err)
    }
  });
}

export function sendInternalMessage(socket: PhxSocket, component: LiveViewComponent<any>, event: any, payload?: any) {
  console.log("internal message", event);
  // check if component has event handler
  if (!(component as any).handleInfo) {
    console.warn("no info handler for component", component);
    return;
  }

  // @ts-ignore
  const ctx = component.handleInfo(event, socket);

  const view = component.render(ctx);

  // map array of dynamics to object with indiceies as keys
  const dynamics = view.dynamics.reduce((acc: { [key: number]: string }, cur: string, index: number) => {
    acc[index] = cur;
    return acc;
  }, {} as { [key: string]: string })

  const reply: PhxDiffReply = [
    null,
    null,
    socket.id,
    "diff",
    { ...dynamics }
  ]
  console.log("sending internal message phx_reply", reply);
  socket.ws!.send(JSON.stringify(reply), { binary: false }, (err: any) => {
    if (err) {
      console.error("error", err)
    }
  });
}