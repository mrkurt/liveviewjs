import { interpret } from 'xstate';
import { done } from 'xstate/lib/actions';
import { LiveViewComponent, LiveViewTemplate } from '..';
import { PhxSocket } from '../socket/types';
import html from '../templates';
import { LiveViewContext } from '../types';
import { createLiveViewComponentMachine, RequestType } from './component_machine'


it('transition to done for http requests', (done) => {
  const httpRequestMachine = createLiveViewComponentMachine(
    {
      requestType: RequestType.http,
      liveViewComponent: new TestLiveViewComponent()
    }
  )

  const machineService = interpret(httpRequestMachine).onTransition(state => {
    if (state.matches('done')) {
      expect(state.context.requestType).toEqual(RequestType.http);
      done()
    }
  });
  machineService.start();

});

it('transition to handleEvents for websocket connections', (done) => {
  const httpRequestMachine = createLiveViewComponentMachine(
    {
      requestType: RequestType.websocket,
      liveViewComponent: new TestLiveViewComponent()
    }
  )

  const machineService = interpret(httpRequestMachine).onTransition(state => {
    if (state.matches('readyForEvents')) {
      expect(state.context.requestType).toEqual(RequestType.websocket);
      done()
    }
  });
  machineService.start();

});


class TestLiveViewComponent implements LiveViewComponent<any> {
  mount(params: any, session: any, socket: PhxSocket): LiveViewContext<any> {
    return {
      data: {
        test: "test"
      }
    }
  }

  handleParams(params: any, session: any, socket: PhxSocket): LiveViewContext<any> {
    return {
      data: {
        test: "test"
      }
    }
  }

  render(ctx: LiveViewContext<any>): LiveViewTemplate {
    return html`
      <div>${ctx.data.test}</div>
    `
  }
}