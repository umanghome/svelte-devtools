if (!window.tag) {
  window.tag = document.createElement('script')
  window.tag.text = `
(function () {
  'use strict';

  const listenerList = [];
  function addNodeListener(listener) {
    listenerList.push(listener);
  }

  function add(node, anchorNode) {
    for (const listener of listenerList) listener.add(node, anchorNode);
  }

  function update(node) {
    if (!node) return

    for (const listener of listenerList) listener.update(node);
  }

  function remove(node) {
    for (const listener of listenerList) listener.remove(node);
  }

  function profile(frame) {
    for (const listener of listenerList) listener.profile(frame);
  }

  let topFrame = {};
  let currentFrame = topFrame;
  let profilerEnabled = false;

  function startProfiler() {
    topFrame = {
      type: 'top',
      start: performance.now(),
      children: [],
    };
    currentFrame = topFrame;
    profilerEnabled = true;
  }

  function stopProfiler() {
    topFrame.end = performance.now(),
    profilerEnabled = false;
  }

  function updateProfile(node, type, fn, ...args) {
    if (!profilerEnabled) {
      fn(...args);
      return
    }

    const parentFrame = currentFrame;
    currentFrame = {
      type,
      node: node.id,
      start: performance.now(),
      children: [],
    };
    parentFrame.children.push(currentFrame);
    fn(...args);
    currentFrame.end = performance.now();
    currentFrame.duration = currentFrame.end - currentFrame.start;
    currentFrame = parentFrame;

    if (currentFrame.type == 'top')
      topFrame.duration = topFrame.children[topFrame.children.length - 1].end - topFrame.children[0].start;

    profile(topFrame);
  }

  const nodeMap = new Map();
  let _id = 0;
  let currentBlock;

  function getNode(id) {
    return nodeMap.get(id)
  }

  let svelteVersion = null;
  function getSvelteVersion() {
    return svelteVersion
  }

  function addNode(node, target, anchor) {
    nodeMap.set(node.id, node);
    nodeMap.set(node.detail, node);

    let targetNode = nodeMap.get(target);
    if (!targetNode || targetNode.parentBlock != node.parentBlock) {
      targetNode = node.parentBlock;
    }

    node.parent = targetNode;

    const anchorNode = nodeMap.get(anchor);

    if (targetNode) {
      let index = -1;
      if (anchorNode) index = targetNode.children.indexOf(anchorNode);

      if (index != -1) {
        targetNode.children.splice(index, 0, node);
      } else {
        targetNode.children.push(node);
      }
    }

    add(node, anchorNode);
  }

  function removeNode(node) {
    if (!node) return

    nodeMap.delete(node.id);
    nodeMap.delete(node.detail);

    const index = node.parent.children.indexOf(node);
    node.parent.children.splice(index, 1);
    node.parent = null;

    remove(node);
  }

  function updateElement(element) {
    const node = nodeMap.get(element);
    if (!node) return

    if (node.type == 'anchor') node.type = 'text';

    update(node);
  }

  function insert(element, target, anchor) {
    const node = {
      id: _id++,
      type:
        element.nodeType == 1
          ? 'element'
          : element.nodeValue && element.nodeValue != ' '
          ? 'text'
          : 'anchor',
      detail: element,
      tagName: element.nodeName.toLowerCase(),
      parentBlock: currentBlock,
      children: []
    };
    addNode(node, target, anchor);

    for (const child of element.childNodes) {
      if (!nodeMap.has(child)) insert(child, element);
    }
  }

  function svelteRegisterComponent (e) {
    const { component, tagName } = e.detail;

    const node = nodeMap.get(component.$$.fragment);
    if (node) {
      nodeMap.delete(component.$$.fragment);

      node.detail = component;
      node.tagName = tagName;

      update(node);
    } else {
      nodeMap.set(component.$$.fragment, {
        type: 'component',
        detail: component,
        tagName
      });
    }
  }

  // Ugly hack b/c promises are resolved/rejected outside of normal render flow
  let lastPromiseParent = null;
  function svelteRegisterBlock (e) {
    const { type, id, block, ...detail } = e.detail;
    const tagName = type == 'pending' ? 'await' : type;
    const nodeId = _id++;

    if (block.m) {
      const mountFn = block.m;
      block.m = (target, anchor) => {
        const parentBlock = currentBlock;
        let node = {
          id: nodeId,
          type: 'block',
          detail,
          tagName,
          parentBlock,
          children: []
        };

        switch (type) {
          case 'then':
          case 'catch':
            if (!node.parentBlock) node.parentBlock = lastPromiseParent;
            break

          case 'slot':
            node.type = 'slot';
            break

          case 'component':
            const componentNode = nodeMap.get(block);
            if (componentNode) {
              nodeMap.delete(block);
              Object.assign(node, componentNode);
            } else {
              Object.assign(node, {
                type: 'component',
                tagName: 'Unknown',
                detail: {}
              });
              nodeMap.set(block, node);
            }

            Promise.resolve().then(
              () =>
                node.detail.$$ &&
                Object.keys(node.detail.$$.bound).length &&
                update(node)
            );
            break
        }

        if (type == 'each') {
          let group = nodeMap.get(parentBlock.id + id);
          if (!group) {
            group = {
              id: _id++,
              type: 'block',
              detail: {
                ctx: {},
                source: detail.source
              },
              tagName: 'each',
              parentBlock,
              children: []
            };
            nodeMap.set(parentBlock.id + id, group);
            addNode(group, target, anchor);
          }
          node.parentBlock = group;
          node.type = 'iteration';
          addNode(node, group, anchor);
        } else {
          addNode(node, target, anchor);
        }

        currentBlock = node;
        updateProfile(node, 'mount', mountFn, target, anchor);
        currentBlock = parentBlock;
      };
    }

    if (block.p) {
      const patchFn = block.p;
      block.p = (changed, ctx) => {
        const parentBlock = currentBlock;
        currentBlock = nodeMap.get(nodeId);

        update(currentBlock);

        updateProfile(currentBlock, 'patch', patchFn, changed, ctx);

        currentBlock = parentBlock;
      };
    }

    if (block.d) {
      const detachFn = block.d;
      block.d = detaching => {
        const node = nodeMap.get(nodeId);

        if (node) {
          if (node.tagName == 'await') lastPromiseParent = node.parentBlock;

          removeNode(node);
        }

        updateProfile(node, 'detach', detachFn, detaching);
      };
    }
  }

  function svelteDOMInsert (e) {
    const { node: element, target, anchor } = e.detail;

    insert(element, target, anchor);
  }

  function svelteDOMRemove (e) {
    const node = nodeMap.get(e.detail.node);
    if (!node) return

    removeNode(node);
  }

  function svelteDOMAddEventListener (e) {
    const { node, ...detail } = e.detail;

    if (!node.__listeners) node.__listeners = [];

    node.__listeners.push(detail);
  }

  function svelteDOMRemoveEventListener (e) {
    const { node, event, handler, modifiers } = e.detail;

    if (!node.__listeners) return

    const index = node.__listeners.findIndex(
      o => o.event == event && o.handler == handler && o.modifiers == modifiers
    );

    if (index == -1) return

    node.__listeners.splice(index, 1);
  }

  function svelteUpdateNode (e) {
    updateElement(e.detail.node);
  }

  function setup (root) {
    root.addEventListener('SvelteRegisterBlock', e => svelteVersion = e.detail.version, { once: true });

    root.addEventListener('SvelteRegisterComponent', svelteRegisterComponent);
    root.addEventListener('SvelteRegisterBlock', svelteRegisterBlock);
    root.addEventListener('SvelteDOMInsert', svelteDOMInsert);
    root.addEventListener('SvelteDOMRemove', svelteDOMRemove);
    root.addEventListener('SvelteDOMAddEventListener', svelteDOMAddEventListener);
    root.addEventListener('SvelteDOMRemoveEventListener', svelteDOMRemoveEventListener);
    root.addEventListener('SvelteDOMSetData', svelteUpdateNode);
    root.addEventListener('SvelteDOMSetProperty', svelteUpdateNode);
    root.addEventListener('SvelteDOMSetAttribute', svelteUpdateNode);
    root.addEventListener('SvelteDOMRemoveAttribute', svelteUpdateNode);
  }

  setup(window.document);

  // List of frames that are already set up
  let framesSetUp = [];

  // Frames might be inserted dynamically, so we keep polling
  setInterval(() => {

    for (let i = 0; i < window.frames.length; i++) {
      const frame = window.frames[i];

      // Skip if already set up.
      if (framesSetUp.includes(frame)) {
        continue;
      }

      framesSetUp.push(frame);

      const root = frame.document;
      setup(root);
      const timer = setInterval(() => {
        if (root == frame.document) return;
        clearTimeout(timer);
        setup(frame.document);
      }, 0);
      root.addEventListener('readystatechange', e => clearTimeout(timer), {
        once: true
      });
    }

  }, 1000);

  const dom = {
    area: document.createElement('div'),
    x: document.createElement('div'),
    y: document.createElement('div')
  };

  Object.assign(dom.area.style, {
    position: 'fixed',
    backgroundColor: 'rgba(0, 136, 204, 0.2)',
    zIndex: '2147483647',
    pointerEvents: 'none'
  });

  Object.assign(dom.x.style, {
    position: 'fixed',
    borderStyle: 'dashed',
    borderColor: 'rgb(0, 136, 204)',
    borderWidth: '1px 0',
    zIndex: '2147483647',
    left: '0',
    width: '100vw',
    pointerEvents: 'none'
  });

  Object.assign(dom.y.style, {
    position: 'fixed',
    borderStyle: 'dashed',
    borderColor: 'rgb(0, 136, 204)',
    borderWidth: '0 1px',
    zIndex: '2147483647',
    top: '0',
    height: '100vh',
    pointerEvents: 'none'
  });

  function getOffset(element) {
    const styles = getComputedStyle(element);
    const margin = {
      top: Math.max(parseInt(styles.marginTop), 0),
      right: Math.max(parseInt(styles.marginRight), 0),
      bottom: Math.max(parseInt(styles.marginBottom), 0),
      left: Math.max(parseInt(styles.marginLeft), 0)
    };

    const rect = {
      width: element.offsetWidth + margin.right + margin.left,
      height: element.offsetHeight + margin.top + margin.bottom,
      top: element.offsetTop - margin.top,
      left: element.offsetLeft - margin.left
    };

    let parent = element;
    while (
      (parent =
        parent.offsetParent || parent.ownerDocument.defaultView.frameElement)
    ) {
      rect.top += parent.offsetTop;
      rect.left += parent.offsetLeft;
    }

    parent = element;
    while (
      (parent =
        parent.parentElement || parent.ownerDocument.defaultView.frameElement)
    ) {
      rect.top -= parent.scrollTop;
      rect.left -= parent.scrollLeft;
    }

    rect.right = rect.left + rect.width;
    rect.bottom = rect.top + rect.height;

    return rect
  }

  function getBoundingRect(node) {
    if (node.type == 'element') return getOffset(node.detail)

    const union = {
      top: Infinity,
      left: Infinity,
      bottom: -Infinity,
      right: -Infinity
    };

    for (const child of node.children) {
      const rect = getBoundingRect(child);
      if (rect.top < union.top) union.top = rect.top;
      if (rect.left < union.left) union.left = rect.left;
      if (rect.bottom > union.bottom) union.bottom = rect.bottom;
      if (rect.right > union.right) union.right = rect.right;
    }

    union.width = union.right - union.left;
    union.height = union.bottom - union.top;

    return union
  }

  function highlight(node) {
    if (!node) {
      dom.area.remove();
      dom.x.remove();
      dom.y.remove();
      return
    }

    const box = getBoundingRect(node);
    Object.assign(dom.area.style, {
      top: box.top + 'px',
      left: box.left + 'px',
      width: box.width + 'px',
      height: box.height + 'px'
    });
    document.body.append(dom.area);

    Object.assign(dom.x.style, {
      top: box.top + 'px',
      height: box.height - 2 + 'px'
    });
    document.body.append(dom.x);

    Object.assign(dom.y.style, {
      left: box.left + 'px',
      width: box.width - 2 + 'px'
    });
    document.body.append(dom.y);
  }

  let target = null;
  function handleMousemove(e) {
    target = e.target;
    highlight({ type: 'element', detail: target });
  }

  function handleClick() {
    stopPicker();
    window.__svelte_devtools_select_element(target);
  }

  function stopPicker() {
    document.removeEventListener('mousemove', handleMousemove, true);
    highlight(null);
  }

  function startPicker() {
    document.addEventListener('mousemove', handleMousemove, true);
    document.addEventListener('click', handleClick, { capture: true, once: true });
  }

  window.__svelte_devtools_inject_state = function(id, key, value) {
    let component = getNode(id).detail;
    component.$inject_state({ [key]: value });
  };

  window.__svelte_devtools_select_element = function(element) {
    let node = getNode(element);
    if (node) window.postMessage({ type: 'inspect', node: serializeNode(node) });
  };

  window.addEventListener('message', e => handleMessage(e.data), false);

  function handleMessage(msg) {
    const node = getNode(msg.nodeId);

    switch (msg.type) {
      case 'setSelected':
        if (node) window.$s = node.detail;
        break

      case 'setHover':
        highlight(node);
        break

      case 'startPicker':
        startPicker();
        break

      case 'stopPicker':
        stopPicker();
        break

      case 'startProfiler':
        startProfiler();
        break

      case 'stopProfiler':
        stopProfiler();
        break
    }
  }

  function clone(value, seen = new Map()) {
    switch (typeof value) {
      case 'function':
        return { __isFunction: true, source: value.toString(), name: value.name }
      case 'symbol':
        return { __isSymbol: true, name: value.toString() }
      case 'object':
        if (value === window || value === null) return null
        if (Array.isArray(value)) return value.map(o => clone(o, seen))
        if (seen.has(value)) return {}

        const o = {};
        seen.set(value, o);

        for (const [key, v] of Object.entries(value)) {
          o[key] = clone(v, seen);
        }

        return o
      default:
        return value
    }
  }

  function gte(major, minor, patch) {
    const version = (getSvelteVersion() || '0.0.0')
      .split('.')
      .map(n => parseInt(n));
    return (
      version[0] > major ||
      (version[0] == major &&
        (version[1] > minor || (version[1] == minor && version[2] >= patch)))
    )
  }

  let _shouldUseCapture = null;
  function shouldUseCapture() {
    return _shouldUseCapture == null
      ? (_shouldUseCapture = gte(3, 19, 2))
      : _shouldUseCapture
  }

  function serializeNode(node) {
    const serialized = {
      id: node.id,
      type: node.type,
      tagName: node.tagName
    };
    switch (node.type) {
      case 'component': {
        if (!node.detail.$$) {
          serialized.detail = {};
          break
        }

        const internal = node.detail.$$;
        const props = Array.isArray(internal.props)
          ? internal.props // Svelte < 3.13.0 stored props names as an array
          : Object.keys(internal.props);
        let ctx = clone(
          shouldUseCapture() ? node.detail.$capture_state() : internal.ctx
        );
        if (ctx === undefined) ctx = {};

        serialized.detail = {
          attributes: props.flatMap(key => {
            const value = ctx[key];
            delete ctx[key];
            return value === undefined
              ? []
              : { key, value, isBound: key in internal.bound }
          }),
          listeners: Object.entries(internal.callbacks).flatMap(
            ([event, value]) => value.map(o => ({ event, handler: o.toString() }))
          ),
          ctx: Object.entries(ctx).map(([key, value]) => ({ key, value }))
        };
        break
      }

      case 'element': {
        const element = node.detail;
        serialized.detail = {
          attributes: Array.from(element.attributes).map(attr => ({
            key: attr.name,
            value: attr.value
          })),
          listeners: element.__listeners
            ? element.__listeners.map(o => ({
                ...o,
                handler: o.handler.toString()
              }))
            : []
        };

        break
      }

      case 'text': {
        serialized.detail = {
          nodeValue: node.detail.nodeValue
        };
        break
      }

      case 'iteration':
      case 'block': {
        const { ctx, source } = node.detail;
        serialized.detail = {
          ctx: Object.entries(clone(ctx)).map(([key, value]) => ({
            key,
            value
          })),
          source: source.substring(source.indexOf('{'), source.indexOf('}') + 1)
        };
      }
    }

    return serialized
  }

  addNodeListener({
    add(node, anchor) {
      window.postMessage({
        target: node.parent ? node.parent.id : null,
        anchor: anchor ? anchor.id : null,
        type: 'addNode',
        node: serializeNode(node)
      });
    },

    remove(node) {
      window.postMessage({
        type: 'removeNode',
        node: serializeNode(node)
      });
    },

    update(node) {
      window.postMessage({
        type: 'updateNode',
        node: serializeNode(node)
      });
    },

    profile(frame) {
      window.postMessage({
        type: 'updateProfile',
        frame
      });
    }
  });

}());
`
  if (window.profilerEnabled) window.tag.text = window.tag.text.replace('let profilerEnabled = false;', '$&\nstartProfiler();')
  document.children[0].append(window.tag)
  const port = chrome.runtime.connect()
  port.onMessage.addListener(window.postMessage.bind(window))
  window.addEventListener(
    'message',
    e => e.source == window && port.postMessage(e.data),
    false
  )
  window.addEventListener('unload', () => port.postMessage({ type: 'clear' }))
}
