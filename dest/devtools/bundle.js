(function (chrome$1) {
    'use strict';

    function noop() { }
    function assign(tar, src) {
        // @ts-ignore
        for (const k in src)
            tar[k] = src[k];
        return tar;
    }
    function run(fn) {
        return fn();
    }
    function blank_object() {
        return Object.create(null);
    }
    function run_all(fns) {
        fns.forEach(run);
    }
    function is_function(thing) {
        return typeof thing === 'function';
    }
    function safe_not_equal(a, b) {
        return a != a ? b == b : a !== b || ((a && typeof a === 'object') || typeof a === 'function');
    }
    function subscribe(store, ...callbacks) {
        if (store == null) {
            return noop;
        }
        const unsub = store.subscribe(...callbacks);
        return unsub.unsubscribe ? () => unsub.unsubscribe() : unsub;
    }
    function get_store_value(store) {
        let value;
        subscribe(store, _ => value = _)();
        return value;
    }
    function component_subscribe(component, store, callback) {
        component.$$.on_destroy.push(subscribe(store, callback));
    }
    function create_slot(definition, ctx, $$scope, fn) {
        if (definition) {
            const slot_ctx = get_slot_context(definition, ctx, $$scope, fn);
            return definition[0](slot_ctx);
        }
    }
    function get_slot_context(definition, ctx, $$scope, fn) {
        return definition[1] && fn
            ? assign($$scope.ctx.slice(), definition[1](fn(ctx)))
            : $$scope.ctx;
    }
    function get_slot_changes(definition, $$scope, dirty, fn) {
        if (definition[2] && fn) {
            const lets = definition[2](fn(dirty));
            if ($$scope.dirty === undefined) {
                return lets;
            }
            if (typeof lets === 'object') {
                const merged = [];
                const len = Math.max($$scope.dirty.length, lets.length);
                for (let i = 0; i < len; i += 1) {
                    merged[i] = $$scope.dirty[i] | lets[i];
                }
                return merged;
            }
            return $$scope.dirty | lets;
        }
        return $$scope.dirty;
    }
    function null_to_empty(value) {
        return value == null ? '' : value;
    }
    function set_store_value(store, ret, value = ret) {
        store.set(value);
        return ret;
    }

    function append(target, node) {
        target.appendChild(node);
    }
    function insert(target, node, anchor) {
        target.insertBefore(node, anchor || null);
    }
    function detach(node) {
        node.parentNode.removeChild(node);
    }
    function destroy_each(iterations, detaching) {
        for (let i = 0; i < iterations.length; i += 1) {
            if (iterations[i])
                iterations[i].d(detaching);
        }
    }
    function element(name) {
        return document.createElement(name);
    }
    function svg_element(name) {
        return document.createElementNS('http://www.w3.org/2000/svg', name);
    }
    function text(data) {
        return document.createTextNode(data);
    }
    function empty() {
        return text('');
    }
    function listen(node, event, handler, options) {
        node.addEventListener(event, handler, options);
        return () => node.removeEventListener(event, handler, options);
    }
    function prevent_default(fn) {
        return function (event) {
            event.preventDefault();
            // @ts-ignore
            return fn.call(this, event);
        };
    }
    function stop_propagation(fn) {
        return function (event) {
            event.stopPropagation();
            // @ts-ignore
            return fn.call(this, event);
        };
    }
    function attr(node, attribute, value) {
        if (value == null)
            node.removeAttribute(attribute);
        else if (node.getAttribute(attribute) !== value)
            node.setAttribute(attribute, value);
    }
    function set_attributes(node, attributes) {
        // @ts-ignore
        const descriptors = Object.getOwnPropertyDescriptors(node.__proto__);
        for (const key in attributes) {
            if (attributes[key] == null) {
                node.removeAttribute(key);
            }
            else if (key === 'style') {
                node.style.cssText = attributes[key];
            }
            else if (key === '__value' || descriptors[key] && descriptors[key].set) {
                node[key] = attributes[key];
            }
            else {
                attr(node, key, attributes[key]);
            }
        }
    }
    function children(element) {
        return Array.from(element.childNodes);
    }
    function set_data(text, data) {
        data = '' + data;
        if (text.data !== data)
            text.data = data;
    }
    function set_input_value(input, value) {
        if (value != null || input.value) {
            input.value = value;
        }
    }
    function set_style(node, key, value, important) {
        node.style.setProperty(key, value, important ? 'important' : '');
    }
    function toggle_class(element, name, toggle) {
        element.classList[toggle ? 'add' : 'remove'](name);
    }
    function custom_event(type, detail) {
        const e = document.createEvent('CustomEvent');
        e.initCustomEvent(type, false, false, detail);
        return e;
    }

    let current_component;
    function set_current_component(component) {
        current_component = component;
    }
    function get_current_component() {
        if (!current_component)
            throw new Error(`Function called outside component initialization`);
        return current_component;
    }
    function createEventDispatcher() {
        const component = get_current_component();
        return (type, detail) => {
            const callbacks = component.$$.callbacks[type];
            if (callbacks) {
                // TODO are there situations where events could be dispatched
                // in a server (non-DOM) environment?
                const event = custom_event(type, detail);
                callbacks.slice().forEach(fn => {
                    fn.call(component, event);
                });
            }
        };
    }
    // TODO figure out if we still want to support
    // shorthand events, or if we want to implement
    // a real bubbling mechanism
    function bubble(component, event) {
        const callbacks = component.$$.callbacks[event.type];
        if (callbacks) {
            callbacks.slice().forEach(fn => fn(event));
        }
    }

    const dirty_components = [];
    const binding_callbacks = [];
    const render_callbacks = [];
    const flush_callbacks = [];
    const resolved_promise = Promise.resolve();
    let update_scheduled = false;
    function schedule_update() {
        if (!update_scheduled) {
            update_scheduled = true;
            resolved_promise.then(flush);
        }
    }
    function tick() {
        schedule_update();
        return resolved_promise;
    }
    function add_render_callback(fn) {
        render_callbacks.push(fn);
    }
    function add_flush_callback(fn) {
        flush_callbacks.push(fn);
    }
    let flushing = false;
    const seen_callbacks = new Set();
    function flush() {
        if (flushing)
            return;
        flushing = true;
        do {
            // first, call beforeUpdate functions
            // and update components
            for (let i = 0; i < dirty_components.length; i += 1) {
                const component = dirty_components[i];
                set_current_component(component);
                update(component.$$);
            }
            dirty_components.length = 0;
            while (binding_callbacks.length)
                binding_callbacks.pop()();
            // then, once components are updated, call
            // afterUpdate functions. This may cause
            // subsequent updates...
            for (let i = 0; i < render_callbacks.length; i += 1) {
                const callback = render_callbacks[i];
                if (!seen_callbacks.has(callback)) {
                    // ...so guard against infinite loops
                    seen_callbacks.add(callback);
                    callback();
                }
            }
            render_callbacks.length = 0;
        } while (dirty_components.length);
        while (flush_callbacks.length) {
            flush_callbacks.pop()();
        }
        update_scheduled = false;
        flushing = false;
        seen_callbacks.clear();
    }
    function update($$) {
        if ($$.fragment !== null) {
            $$.update();
            run_all($$.before_update);
            const dirty = $$.dirty;
            $$.dirty = [-1];
            $$.fragment && $$.fragment.p($$.ctx, dirty);
            $$.after_update.forEach(add_render_callback);
        }
    }
    const outroing = new Set();
    let outros;
    function group_outros() {
        outros = {
            r: 0,
            c: [],
            p: outros // parent group
        };
    }
    function check_outros() {
        if (!outros.r) {
            run_all(outros.c);
        }
        outros = outros.p;
    }
    function transition_in(block, local) {
        if (block && block.i) {
            outroing.delete(block);
            block.i(local);
        }
    }
    function transition_out(block, local, detach, callback) {
        if (block && block.o) {
            if (outroing.has(block))
                return;
            outroing.add(block);
            outros.c.push(() => {
                outroing.delete(block);
                if (callback) {
                    if (detach)
                        block.d(1);
                    callback();
                }
            });
            block.o(local);
        }
    }

    const globals = (typeof window !== 'undefined' ? window : global);
    function outro_and_destroy_block(block, lookup) {
        transition_out(block, 1, 1, () => {
            lookup.delete(block.key);
        });
    }
    function update_keyed_each(old_blocks, dirty, get_key, dynamic, ctx, list, lookup, node, destroy, create_each_block, next, get_context) {
        let o = old_blocks.length;
        let n = list.length;
        let i = o;
        const old_indexes = {};
        while (i--)
            old_indexes[old_blocks[i].key] = i;
        const new_blocks = [];
        const new_lookup = new Map();
        const deltas = new Map();
        i = n;
        while (i--) {
            const child_ctx = get_context(ctx, list, i);
            const key = get_key(child_ctx);
            let block = lookup.get(key);
            if (!block) {
                block = create_each_block(key, child_ctx);
                block.c();
            }
            else if (dynamic) {
                block.p(child_ctx, dirty);
            }
            new_lookup.set(key, new_blocks[i] = block);
            if (key in old_indexes)
                deltas.set(key, Math.abs(i - old_indexes[key]));
        }
        const will_move = new Set();
        const did_move = new Set();
        function insert(block) {
            transition_in(block, 1);
            block.m(node, next, lookup.has(block.key));
            lookup.set(block.key, block);
            next = block.first;
            n--;
        }
        while (o && n) {
            const new_block = new_blocks[n - 1];
            const old_block = old_blocks[o - 1];
            const new_key = new_block.key;
            const old_key = old_block.key;
            if (new_block === old_block) {
                // do nothing
                next = new_block.first;
                o--;
                n--;
            }
            else if (!new_lookup.has(old_key)) {
                // remove old block
                destroy(old_block, lookup);
                o--;
            }
            else if (!lookup.has(new_key) || will_move.has(new_key)) {
                insert(new_block);
            }
            else if (did_move.has(old_key)) {
                o--;
            }
            else if (deltas.get(new_key) > deltas.get(old_key)) {
                did_move.add(new_key);
                insert(new_block);
            }
            else {
                will_move.add(old_key);
                o--;
            }
        }
        while (o--) {
            const old_block = old_blocks[o];
            if (!new_lookup.has(old_block.key))
                destroy(old_block, lookup);
        }
        while (n)
            insert(new_blocks[n - 1]);
        return new_blocks;
    }

    function get_spread_update(levels, updates) {
        const update = {};
        const to_null_out = {};
        const accounted_for = { $$scope: 1 };
        let i = levels.length;
        while (i--) {
            const o = levels[i];
            const n = updates[i];
            if (n) {
                for (const key in o) {
                    if (!(key in n))
                        to_null_out[key] = 1;
                }
                for (const key in n) {
                    if (!accounted_for[key]) {
                        update[key] = n[key];
                        accounted_for[key] = 1;
                    }
                }
                levels[i] = n;
            }
            else {
                for (const key in o) {
                    accounted_for[key] = 1;
                }
            }
        }
        for (const key in to_null_out) {
            if (!(key in update))
                update[key] = undefined;
        }
        return update;
    }
    function get_spread_object(spread_props) {
        return typeof spread_props === 'object' && spread_props !== null ? spread_props : {};
    }

    function bind(component, name, callback) {
        const index = component.$$.props[name];
        if (index !== undefined) {
            component.$$.bound[index] = callback;
            callback(component.$$.ctx[index]);
        }
    }
    function create_component(block) {
        block && block.c();
    }
    function mount_component(component, target, anchor) {
        const { fragment, on_mount, on_destroy, after_update } = component.$$;
        fragment && fragment.m(target, anchor);
        // onMount happens before the initial afterUpdate
        add_render_callback(() => {
            const new_on_destroy = on_mount.map(run).filter(is_function);
            if (on_destroy) {
                on_destroy.push(...new_on_destroy);
            }
            else {
                // Edge case - component was destroyed immediately,
                // most likely as a result of a binding initialising
                run_all(new_on_destroy);
            }
            component.$$.on_mount = [];
        });
        after_update.forEach(add_render_callback);
    }
    function destroy_component(component, detaching) {
        const $$ = component.$$;
        if ($$.fragment !== null) {
            run_all($$.on_destroy);
            $$.fragment && $$.fragment.d(detaching);
            // TODO null out other refs, including component.$$ (but need to
            // preserve final state?)
            $$.on_destroy = $$.fragment = null;
            $$.ctx = [];
        }
    }
    function make_dirty(component, i) {
        if (component.$$.dirty[0] === -1) {
            dirty_components.push(component);
            schedule_update();
            component.$$.dirty.fill(0);
        }
        component.$$.dirty[(i / 31) | 0] |= (1 << (i % 31));
    }
    function init(component, options, instance, create_fragment, not_equal, props, dirty = [-1]) {
        const parent_component = current_component;
        set_current_component(component);
        const prop_values = options.props || {};
        const $$ = component.$$ = {
            fragment: null,
            ctx: null,
            // state
            props,
            update: noop,
            not_equal,
            bound: blank_object(),
            // lifecycle
            on_mount: [],
            on_destroy: [],
            before_update: [],
            after_update: [],
            context: new Map(parent_component ? parent_component.$$.context : []),
            // everything else
            callbacks: blank_object(),
            dirty
        };
        let ready = false;
        $$.ctx = instance
            ? instance(component, prop_values, (i, ret, ...rest) => {
                const value = rest.length ? rest[0] : ret;
                if ($$.ctx && not_equal($$.ctx[i], $$.ctx[i] = value)) {
                    if ($$.bound[i])
                        $$.bound[i](value);
                    if (ready)
                        make_dirty(component, i);
                }
                return ret;
            })
            : [];
        $$.update();
        ready = true;
        run_all($$.before_update);
        // `false` as a special case of no DOM component
        $$.fragment = create_fragment ? create_fragment($$.ctx) : false;
        if (options.target) {
            if (options.hydrate) {
                const nodes = children(options.target);
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                $$.fragment && $$.fragment.l(nodes);
                nodes.forEach(detach);
            }
            else {
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                $$.fragment && $$.fragment.c();
            }
            if (options.intro)
                transition_in(component.$$.fragment);
            mount_component(component, options.target, options.anchor);
            flush();
        }
        set_current_component(parent_component);
    }
    class SvelteComponent {
        $destroy() {
            destroy_component(this, 1);
            this.$destroy = noop;
        }
        $on(type, callback) {
            const callbacks = (this.$$.callbacks[type] || (this.$$.callbacks[type] = []));
            callbacks.push(callback);
            return () => {
                const index = callbacks.indexOf(callback);
                if (index !== -1)
                    callbacks.splice(index, 1);
            };
        }
        $set() {
            // overridden by instance, if it has props
        }
    }

    const subscriber_queue = [];
    /**
     * Create a `Writable` store that allows both updating and reading by subscription.
     * @param {*=}value initial value
     * @param {StartStopNotifier=}start start and stop notifications for subscriptions
     */
    function writable(value, start = noop) {
        let stop;
        const subscribers = [];
        function set(new_value) {
            if (safe_not_equal(value, new_value)) {
                value = new_value;
                if (stop) { // store is ready
                    const run_queue = !subscriber_queue.length;
                    for (let i = 0; i < subscribers.length; i += 1) {
                        const s = subscribers[i];
                        s[1]();
                        subscriber_queue.push(s, value);
                    }
                    if (run_queue) {
                        for (let i = 0; i < subscriber_queue.length; i += 2) {
                            subscriber_queue[i][0](subscriber_queue[i + 1]);
                        }
                        subscriber_queue.length = 0;
                    }
                }
            }
        }
        function update(fn) {
            set(fn(value));
        }
        function subscribe(run, invalidate = noop) {
            const subscriber = [run, invalidate];
            subscribers.push(subscriber);
            if (subscribers.length === 1) {
                stop = start(set) || noop;
            }
            run(value);
            return () => {
                const index = subscribers.indexOf(subscriber);
                if (index !== -1) {
                    subscribers.splice(index, 1);
                }
                if (subscribers.length === 0) {
                    stop();
                    stop = null;
                }
            };
        }
        return { set, update, subscribe };
    }

    const visibility = writable({
      component: true,
      element: true,
      block: true,
      iteration: true,
      slot: true,
      text: true,
      anchor: false
    });
    const selectedNode = writable({});
    const hoveredNodeId = writable(null);
    const rootNodes = writable([]);
    const searchValue = writable('');
    const profilerEnabled = writable(false);
    const profileFrame = writable({});

    const nodeMap = new Map();

    const port = chrome.runtime.connect();
    port.postMessage({
      type: 'init',
      tabId: chrome.devtools.inspectedWindow.tabId
    });

    function reload() {
      port.postMessage({
        type: 'reload',
        tabId: chrome.devtools.inspectedWindow.tabId
      });
    }

    function startPicker() {
      port.postMessage({
        type: 'startPicker',
        tabId: chrome.devtools.inspectedWindow.tabId
      });
    }

    function stopPicker() {
      port.postMessage({
        type: 'stopPicker',
        tabId: chrome.devtools.inspectedWindow.tabId
      });
    }

    selectedNode.subscribe(node => {
      port.postMessage({
        type: 'setSelected',
        tabId: chrome.devtools.inspectedWindow.tabId,
        nodeId: node.id
      });

      let invalid = null;
      while (node.parent) {
        node = node.parent;
        if (node.collapsed) {
          invalid = node;
          node.collapsed = false;
        }
      }

      if (invalid) invalid.invalidate();
    });

    hoveredNodeId.subscribe(nodeId =>
      port.postMessage({
        type: 'setHover',
        tabId: chrome.devtools.inspectedWindow.tabId,
        nodeId
      })
    );

    profilerEnabled.subscribe(o =>
      port.postMessage({
        type: o ? 'startProfiler' : 'stopProfiler',
        tabId: chrome.devtools.inspectedWindow.tabId
      })
    );

    function noop$1() {}

    function insertNode(node, target, anchorId) {
      node.parent = target;

      let index = -1;
      if (anchorId) index = target.children.findIndex(o => o.id == anchorId);

      if (index != -1) {
        target.children.splice(index, 0, node);
      } else {
        target.children.push(node);
      }

      target.invalidate();
    }

    function resolveFrame(frame) {
      frame.children.forEach(resolveFrame);

      if (!frame.node) return

      frame.node = nodeMap.get(frame.node) || {
        tagName: 'Unknown',
        type: 'Unknown'
      };
    }

    function resolveEventBubble(node) {
      if (!node.detail || !node.detail.listeners) return

      for (const listener of node.detail.listeners) {
        if (!listener.handler.includes('bubble($$self, event)')) continue

        listener.handler = () => {
          let target = node;
          while ((target = target.parent)) if (target.type == 'component') break

          const listeners = target.detail.listeners;
          if (!listeners) return null

          const parentListener = listeners.find(o => o.event == listener.event);
          if (!parentListener) return null

          const handler = parentListener.handler;
          if (!handler) return null

          return (
            '// From parent\n' +
            (typeof handler == 'function' ? handler() : handler)
          )
        };
      }
    }

    port.onMessage.addListener(msg => {
      switch (msg.type) {
        case 'clear': {
          selectedNode.set({});
          hoveredNodeId.set(null);
          rootNodes.set([]);

          break
        }

        case 'addNode': {
          const node = msg.node;
          node.children = [];
          node.collapsed = true;
          node.invalidate = noop$1;
          resolveEventBubble(node);

          const targetNode = nodeMap.get(msg.target);
          nodeMap.set(node.id, node);

          if (targetNode) {
            insertNode(node, targetNode, msg.anchor);
            return
          }

          if (node._timeout) return

          node._timeout = setTimeout(() => {
            delete node._timeout;
            const targetNode = nodeMap.get(msg.target);
            if (targetNode) insertNode(node, targetNode, msg.anchor);
            else rootNodes.update(o => (o.push(node), o));
          }, 100);

          break
        }

        case 'removeNode': {
          const node = nodeMap.get(msg.node.id);
          const index = node.parent.children.findIndex(o => o.id == node.id);
          node.parent.children.splice(index, 1);
          nodeMap.delete(node.id);

          node.parent.invalidate();

          break
        }

        case 'updateNode': {
          const node = nodeMap.get(msg.node.id);
          Object.assign(node, msg.node);
          resolveEventBubble(node);

          const selected = get_store_value(selectedNode);
          if (selected && selected.id == msg.node.id) selectedNode.update(o => o);

          node.invalidate();

          break
        }

        case 'inspect': {
          let node = nodeMap.get(msg.node.id);
          selectedNode.set(node);

          break
        }

        case 'updateProfile': {
          resolveFrame(msg.frame);
          profileFrame.set(msg.frame);
          break
        }
      }
    });

    /* src/toolbar/Toolbar.svelte generated by Svelte v3.20.1 */

    function create_fragment(ctx) {
    	let div;
    	let current;
    	const default_slot_template = /*$$slots*/ ctx[1].default;
    	const default_slot = create_slot(default_slot_template, ctx, /*$$scope*/ ctx[0], null);

    	return {
    		c() {
    			div = element("div");
    			if (default_slot) default_slot.c();
    			attr(div, "class", "svelte-gj5flx");
    		},
    		m(target, anchor) {
    			insert(target, div, anchor);

    			if (default_slot) {
    				default_slot.m(div, null);
    			}

    			current = true;
    		},
    		p(ctx, [dirty]) {
    			if (default_slot) {
    				if (default_slot.p && dirty & /*$$scope*/ 1) {
    					default_slot.p(get_slot_context(default_slot_template, ctx, /*$$scope*/ ctx[0], null), get_slot_changes(default_slot_template, /*$$scope*/ ctx[0], dirty, null));
    				}
    			}
    		},
    		i(local) {
    			if (current) return;
    			transition_in(default_slot, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(default_slot, local);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(div);
    			if (default_slot) default_slot.d(detaching);
    		}
    	};
    }

    function instance($$self, $$props, $$invalidate) {
    	let { $$slots = {}, $$scope } = $$props;

    	$$self.$set = $$props => {
    		if ("$$scope" in $$props) $$invalidate(0, $$scope = $$props.$$scope);
    	};

    	return [$$scope, $$slots];
    }

    class Toolbar extends SvelteComponent {
    	constructor(options) {
    		super();
    		init(this, options, instance, create_fragment, safe_not_equal, {});
    	}
    }

    /* src/toolbar/Button.svelte generated by Svelte v3.20.1 */

    function create_fragment$1(ctx) {
    	let button;
    	let current;
    	let dispose;
    	const default_slot_template = /*$$slots*/ ctx[4].default;
    	const default_slot = create_slot(default_slot_template, ctx, /*$$scope*/ ctx[3], null);

    	return {
    		c() {
    			button = element("button");
    			if (default_slot) default_slot.c();
    			button.disabled = /*disabled*/ ctx[0];
    			attr(button, "type", /*type*/ ctx[2]);
    			attr(button, "class", "svelte-1qgnb6u");
    			toggle_class(button, "active", /*active*/ ctx[1]);
    		},
    		m(target, anchor, remount) {
    			insert(target, button, anchor);

    			if (default_slot) {
    				default_slot.m(button, null);
    			}

    			current = true;
    			if (remount) dispose();
    			dispose = listen(button, "click", /*click_handler*/ ctx[5]);
    		},
    		p(ctx, [dirty]) {
    			if (default_slot) {
    				if (default_slot.p && dirty & /*$$scope*/ 8) {
    					default_slot.p(get_slot_context(default_slot_template, ctx, /*$$scope*/ ctx[3], null), get_slot_changes(default_slot_template, /*$$scope*/ ctx[3], dirty, null));
    				}
    			}

    			if (!current || dirty & /*disabled*/ 1) {
    				button.disabled = /*disabled*/ ctx[0];
    			}

    			if (!current || dirty & /*type*/ 4) {
    				attr(button, "type", /*type*/ ctx[2]);
    			}

    			if (dirty & /*active*/ 2) {
    				toggle_class(button, "active", /*active*/ ctx[1]);
    			}
    		},
    		i(local) {
    			if (current) return;
    			transition_in(default_slot, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(default_slot, local);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(button);
    			if (default_slot) default_slot.d(detaching);
    			dispose();
    		}
    	};
    }

    function instance$1($$self, $$props, $$invalidate) {
    	let { disabled } = $$props;
    	let { active } = $$props;
    	let { type = "button" } = $$props;
    	let { $$slots = {}, $$scope } = $$props;

    	function click_handler(event) {
    		bubble($$self, event);
    	}

    	$$self.$set = $$props => {
    		if ("disabled" in $$props) $$invalidate(0, disabled = $$props.disabled);
    		if ("active" in $$props) $$invalidate(1, active = $$props.active);
    		if ("type" in $$props) $$invalidate(2, type = $$props.type);
    		if ("$$scope" in $$props) $$invalidate(3, $$scope = $$props.$$scope);
    	};

    	return [disabled, active, type, $$scope, $$slots, click_handler];
    }

    class Button extends SvelteComponent {
    	constructor(options) {
    		super();
    		init(this, options, instance$1, create_fragment$1, safe_not_equal, { disabled: 0, active: 1, type: 2 });
    	}
    }

    /* src/toolbar/Search.svelte generated by Svelte v3.20.1 */

    function create_if_block(ctx) {
    	let t0_value = /*resultsPosition*/ ctx[1] + 1 + "";
    	let t0;
    	let t1;
    	let t2_value = /*results*/ ctx[0].length + "";
    	let t2;
    	let t3;

    	return {
    		c() {
    			t0 = text(t0_value);
    			t1 = text(" of ");
    			t2 = text(t2_value);
    			t3 = text(" ");
    		},
    		m(target, anchor) {
    			insert(target, t0, anchor);
    			insert(target, t1, anchor);
    			insert(target, t2, anchor);
    			insert(target, t3, anchor);
    		},
    		p(ctx, dirty) {
    			if (dirty & /*resultsPosition*/ 2 && t0_value !== (t0_value = /*resultsPosition*/ ctx[1] + 1 + "")) set_data(t0, t0_value);
    			if (dirty & /*results*/ 1 && t2_value !== (t2_value = /*results*/ ctx[0].length + "")) set_data(t2, t2_value);
    		},
    		d(detaching) {
    			if (detaching) detach(t0);
    			if (detaching) detach(t1);
    			if (detaching) detach(t2);
    			if (detaching) detach(t3);
    		}
    	};
    }

    // (92:231) <Button type="submit" disabled={!results.length}>
    function create_default_slot_1(ctx) {
    	let div;

    	return {
    		c() {
    			div = element("div");
    			attr(div, "class", "next svelte-1dwzb61");
    		},
    		m(target, anchor) {
    			insert(target, div, anchor);
    		},
    		d(detaching) {
    			if (detaching) detach(div);
    		}
    	};
    }

    // (92:309) <Button on:click={prev} disabled={!results.length}>
    function create_default_slot(ctx) {
    	let div;

    	return {
    		c() {
    			div = element("div");
    			attr(div, "class", "prev svelte-1dwzb61");
    		},
    		m(target, anchor) {
    			insert(target, div, anchor);
    		},
    		d(detaching) {
    			if (detaching) detach(div);
    		}
    	};
    }

    function create_fragment$2(ctx) {
    	let form;
    	let div;
    	let svg;
    	let path0;
    	let path1;
    	let input;
    	let if_block_anchor;
    	let current;
    	let dispose;
    	let if_block = /*resultsPosition*/ ctx[1] > -1 && create_if_block(ctx);

    	const button0 = new Button({
    			props: {
    				type: "submit",
    				disabled: !/*results*/ ctx[0].length,
    				$$slots: { default: [create_default_slot_1] },
    				$$scope: { ctx }
    			}
    		});

    	const button1 = new Button({
    			props: {
    				disabled: !/*results*/ ctx[0].length,
    				$$slots: { default: [create_default_slot] },
    				$$scope: { ctx }
    			}
    		});

    	button1.$on("click", /*prev*/ ctx[4]);

    	return {
    		c() {
    			form = element("form");
    			div = element("div");
    			svg = svg_element("svg");
    			path0 = svg_element("path");
    			path1 = svg_element("path");
    			input = element("input");
    			if (if_block) if_block.c();
    			if_block_anchor = empty();
    			create_component(button0.$$.fragment);
    			create_component(button1.$$.fragment);
    			attr(div, "class", "separator svelte-1dwzb61");
    			attr(path0, "fill", "rgba(135, 135, 137, 0.9)");
    			attr(path0, "d", "M15.707 14.293l-5-5-1.414 1.414 5 5a1 1 0 0 0 1.414-1.414z");
    			attr(path1, "fill", "rgba(135, 135, 137, 0.9)");
    			attr(path1, "fill-rule", "evenodd");
    			attr(path1, "d", "M6 10a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm0 2A6 6 0 1 0 6 0a6 6 0 0 0 0 12z");
    			attr(svg, "xmlns", "http://www.w3.org/2000/svg");
    			attr(svg, "viewBox", "0 0 16 16");
    			attr(svg, "class", "svelte-1dwzb61");
    			attr(input, "placeholder", "Search");
    			attr(input, "class", "svelte-1dwzb61");
    			attr(form, "class", "svelte-1dwzb61");
    		},
    		m(target, anchor, remount) {
    			insert(target, form, anchor);
    			append(form, div);
    			append(form, svg);
    			append(svg, path0);
    			append(svg, path1);
    			append(form, input);
    			set_input_value(input, /*$searchValue*/ ctx[2]);
    			if (if_block) if_block.m(form, null);
    			append(form, if_block_anchor);
    			mount_component(button0, form, null);
    			mount_component(button1, form, null);
    			current = true;
    			if (remount) run_all(dispose);

    			dispose = [
    				listen(input, "input", /*input_input_handler*/ ctx[7]),
    				listen(form, "submit", prevent_default(/*next*/ ctx[3]))
    			];
    		},
    		p(ctx, [dirty]) {
    			if (dirty & /*$searchValue*/ 4 && input.value !== /*$searchValue*/ ctx[2]) {
    				set_input_value(input, /*$searchValue*/ ctx[2]);
    			}

    			if (/*resultsPosition*/ ctx[1] > -1) {
    				if (if_block) {
    					if_block.p(ctx, dirty);
    				} else {
    					if_block = create_if_block(ctx);
    					if_block.c();
    					if_block.m(form, if_block_anchor);
    				}
    			} else if (if_block) {
    				if_block.d(1);
    				if_block = null;
    			}

    			const button0_changes = {};
    			if (dirty & /*results*/ 1) button0_changes.disabled = !/*results*/ ctx[0].length;

    			if (dirty & /*$$scope*/ 256) {
    				button0_changes.$$scope = { dirty, ctx };
    			}

    			button0.$set(button0_changes);
    			const button1_changes = {};
    			if (dirty & /*results*/ 1) button1_changes.disabled = !/*results*/ ctx[0].length;

    			if (dirty & /*$$scope*/ 256) {
    				button1_changes.$$scope = { dirty, ctx };
    			}

    			button1.$set(button1_changes);
    		},
    		i(local) {
    			if (current) return;
    			transition_in(button0.$$.fragment, local);
    			transition_in(button1.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(button0.$$.fragment, local);
    			transition_out(button1.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(form);
    			if (if_block) if_block.d();
    			destroy_component(button0);
    			destroy_component(button1);
    			run_all(dispose);
    		}
    	};
    }

    function instance$2($$self, $$props, $$invalidate) {
    	let $rootNodes;
    	let $searchValue;
    	component_subscribe($$self, rootNodes, $$value => $$invalidate(5, $rootNodes = $$value));
    	component_subscribe($$self, searchValue, $$value => $$invalidate(2, $searchValue = $$value));

    	function next() {
    		if (resultsPosition >= results.length - 1) $$invalidate(1, resultsPosition = -1);
    		selectedNode.set(results[$$invalidate(1, ++resultsPosition)]);
    	}

    	function prev() {
    		if (resultsPosition <= 0) $$invalidate(1, resultsPosition = results.length);
    		selectedNode.set(results[$$invalidate(1, --resultsPosition)]);
    	}

    	function search(nodeList = $rootNodes) {
    		for (const node of nodeList) {
    			if (node.tagName.includes($searchValue) || node.detail && JSON.stringify(node.detail).includes($searchValue)) results.push(node);
    			search(node.children);
    		}
    	}

    	let results;
    	let resultsPosition;

    	function input_input_handler() {
    		$searchValue = this.value;
    		searchValue.set($searchValue);
    	}

    	$$self.$$.update = () => {
    		if ($$self.$$.dirty & /*$searchValue*/ 4) {
    			 {
    				$$invalidate(0, results = []);
    				$$invalidate(1, resultsPosition = -1);
    				if ($searchValue.length > 1) search();
    			}
    		}
    	};

    	return [
    		results,
    		resultsPosition,
    		$searchValue,
    		next,
    		prev,
    		$rootNodes,
    		search,
    		input_input_handler
    	];
    }

    class Search extends SvelteComponent {
    	constructor(options) {
    		super();
    		init(this, options, instance$2, create_fragment$2, safe_not_equal, {});
    	}
    }

    /* src/toolbar/ProfileButton.svelte generated by Svelte v3.20.1 */

    function create_else_block(ctx) {
    	let svg;
    	let path;

    	return {
    		c() {
    			svg = svg_element("svg");
    			path = svg_element("path");
    			attr(path, "d", "M0,4.8H3.4V16H0ZM6.4,0H9.6V16H6.4Zm6.4,9H16V16h-3.2z");
    			attr(svg, "xmlns", "http://www.w3.org/2000/svg");
    			attr(svg, "viewBox", "0 0 16 16");
    		},
    		m(target, anchor) {
    			insert(target, svg, anchor);
    			append(svg, path);
    		},
    		d(detaching) {
    			if (detaching) detach(svg);
    		}
    	};
    }

    // (3:111) {#if $profilerEnabled}
    function create_if_block$1(ctx) {
    	let svg;
    	let path;

    	return {
    		c() {
    			svg = svg_element("svg");
    			path = svg_element("path");
    			attr(path, "d", "M12.7,1.4 11.3,0l-8,8 8,8 1.4,-1.4L6,8Z");
    			attr(svg, "xmlns", "http://www.w3.org/2000/svg");
    			attr(svg, "viewBox", "0 0 16 16");
    		},
    		m(target, anchor) {
    			insert(target, svg, anchor);
    			append(svg, path);
    		},
    		d(detaching) {
    			if (detaching) detach(svg);
    		}
    	};
    }

    // (3:47) <Button on:click={() => ($profilerEnabled = !$profilerEnabled)}>
    function create_default_slot$1(ctx) {
    	let if_block_anchor;

    	function select_block_type(ctx, dirty) {
    		if (/*$profilerEnabled*/ ctx[0]) return create_if_block$1;
    		return create_else_block;
    	}

    	let current_block_type = select_block_type(ctx);
    	let if_block = current_block_type(ctx);

    	return {
    		c() {
    			if_block.c();
    			if_block_anchor = empty();
    		},
    		m(target, anchor) {
    			if_block.m(target, anchor);
    			insert(target, if_block_anchor, anchor);
    		},
    		p(ctx, dirty) {
    			if (current_block_type !== (current_block_type = select_block_type(ctx))) {
    				if_block.d(1);
    				if_block = current_block_type(ctx);

    				if (if_block) {
    					if_block.c();
    					if_block.m(if_block_anchor.parentNode, if_block_anchor);
    				}
    			}
    		},
    		d(detaching) {
    			if_block.d(detaching);
    			if (detaching) detach(if_block_anchor);
    		}
    	};
    }

    function create_fragment$3(ctx) {
    	let current;

    	const button = new Button({
    			props: {
    				$$slots: { default: [create_default_slot$1] },
    				$$scope: { ctx }
    			}
    		});

    	button.$on("click", /*click_handler*/ ctx[1]);

    	return {
    		c() {
    			create_component(button.$$.fragment);
    		},
    		m(target, anchor) {
    			mount_component(button, target, anchor);
    			current = true;
    		},
    		p(ctx, [dirty]) {
    			const button_changes = {};

    			if (dirty & /*$$scope, $profilerEnabled*/ 5) {
    				button_changes.$$scope = { dirty, ctx };
    			}

    			button.$set(button_changes);
    		},
    		i(local) {
    			if (current) return;
    			transition_in(button.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(button.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			destroy_component(button, detaching);
    		}
    	};
    }

    function instance$3($$self, $$props, $$invalidate) {
    	let $profilerEnabled;
    	component_subscribe($$self, profilerEnabled, $$value => $$invalidate(0, $profilerEnabled = $$value));
    	const click_handler = () => set_store_value(profilerEnabled, $profilerEnabled = !$profilerEnabled);
    	return [$profilerEnabled, click_handler];
    }

    class ProfileButton extends SvelteComponent {
    	constructor(options) {
    		super();
    		init(this, options, instance$3, create_fragment$3, safe_not_equal, {});
    	}
    }

    /* src/toolbar/PickerButton.svelte generated by Svelte v3.20.1 */

    function create_default_slot$2(ctx) {
    	let svg;
    	let path0;
    	let path1;

    	return {
    		c() {
    			svg = svg_element("svg");
    			path0 = svg_element("path");
    			path1 = svg_element("path");
    			attr(path0, "d", "M3 3a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h2.6a1 1 0 1 1 0 2H3a3 3 0 0\n      1-3-3V4a3 3 0 0 1 3-3h10a3 3 0 0 1 3 3v2.6a1 1 0 1 1-2 0V4a1 1 0 0\n      0-1-1H3z");
    			attr(path1, "d", "M12.87 14.6c.3.36.85.4 1.2.1.36-.31.4-.86.1-1.22l-1.82-2.13 2.42-1a.3.3\n      0 0 0 .01-.56L7.43 6.43a.3.3 0 0 0-.42.35l2.13 7.89a.3.3 0 0 0\n      .55.07l1.35-2.28 1.83 2.14z");
    			attr(svg, "xmlns", "http://www.w3.org/2000/svg");
    			attr(svg, "viewBox", "0 0 16 16");
    		},
    		m(target, anchor) {
    			insert(target, svg, anchor);
    			append(svg, path0);
    			append(svg, path1);
    		},
    		d(detaching) {
    			if (detaching) detach(svg);
    		}
    	};
    }

    function create_fragment$4(ctx) {
    	let current;

    	const button = new Button({
    			props: {
    				active: /*active*/ ctx[0],
    				$$slots: { default: [create_default_slot$2] },
    				$$scope: { ctx }
    			}
    		});

    	button.$on("click", /*click*/ ctx[1]);

    	return {
    		c() {
    			create_component(button.$$.fragment);
    		},
    		m(target, anchor) {
    			mount_component(button, target, anchor);
    			current = true;
    		},
    		p(ctx, [dirty]) {
    			const button_changes = {};
    			if (dirty & /*active*/ 1) button_changes.active = /*active*/ ctx[0];

    			if (dirty & /*$$scope*/ 8) {
    				button_changes.$$scope = { dirty, ctx };
    			}

    			button.$set(button_changes);
    		},
    		i(local) {
    			if (current) return;
    			transition_in(button.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(button.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			destroy_component(button, detaching);
    		}
    	};
    }

    function instance$4($$self, $$props, $$invalidate) {
    	let active = false;

    	let unsub = () => {
    		
    	};

    	function click() {
    		if (active) {
    			$$invalidate(0, active = false);
    			stopPicker();
    			return;
    		}

    		unsub();

    		unsub = selectedNode.subscribe(node => {
    			if (!active) return;
    			$$invalidate(0, active = false);
    			unsub();
    			setTimeout(() => node.dom && node.dom.scrollIntoView({ block: "center" }), 120);
    		});

    		$$invalidate(0, active = true);
    		startPicker();
    	}

    	return [active, click];
    }

    class PickerButton extends SvelteComponent {
    	constructor(options) {
    		super();
    		init(this, options, instance$4, create_fragment$4, safe_not_equal, {});
    	}
    }

    /* src/toolbar/VisibilityButton.svelte generated by Svelte v3.20.1 */

    function create_if_block$2(ctx) {
    	let div;
    	let ul;
    	let span;
    	let li0;
    	let li1;
    	let li2;
    	let li3;
    	let li4;
    	let li5;
    	let dispose;

    	return {
    		c() {
    			div = element("div");
    			ul = element("ul");
    			span = element("span");
    			li0 = element("li");
    			li0.textContent = "Components";
    			li1 = element("li");
    			li1.textContent = "Elements";
    			li2 = element("li");
    			li2.textContent = "Blocks";
    			li3 = element("li");
    			li3.textContent = "Slots";
    			li4 = element("li");
    			li4.textContent = "Anchors";
    			li5 = element("li");
    			li5.textContent = "Text";
    			attr(div, "class", "svelte-1bcpdpp");
    			attr(span, "class", "svelte-1bcpdpp");
    			attr(li0, "class", "svelte-1bcpdpp");
    			toggle_class(li0, "checked", /*$visibility*/ ctx[1].component);
    			attr(li1, "class", "svelte-1bcpdpp");
    			toggle_class(li1, "checked", /*$visibility*/ ctx[1].element);
    			attr(li2, "class", "svelte-1bcpdpp");
    			toggle_class(li2, "checked", /*$visibility*/ ctx[1].block);
    			attr(li3, "class", "svelte-1bcpdpp");
    			toggle_class(li3, "checked", /*$visibility*/ ctx[1].slot);
    			attr(li4, "class", "svelte-1bcpdpp");
    			toggle_class(li4, "checked", /*$visibility*/ ctx[1].anchor);
    			attr(li5, "class", "svelte-1bcpdpp");
    			toggle_class(li5, "checked", /*$visibility*/ ctx[1].text);
    			attr(ul, "class", "svelte-1bcpdpp");
    		},
    		m(target, anchor, remount) {
    			insert(target, div, anchor);
    			insert(target, ul, anchor);
    			append(ul, span);
    			append(ul, li0);
    			append(ul, li1);
    			append(ul, li2);
    			append(ul, li3);
    			append(ul, li4);
    			append(ul, li5);
    			if (remount) run_all(dispose);

    			dispose = [
    				listen(div, "click", stop_propagation(/*click_handler*/ ctx[2])),
    				listen(li0, "click", /*click_handler_1*/ ctx[3]),
    				listen(li1, "click", /*click_handler_2*/ ctx[4]),
    				listen(li2, "click", /*click_handler_3*/ ctx[5]),
    				listen(li3, "click", /*click_handler_4*/ ctx[6]),
    				listen(li4, "click", /*click_handler_5*/ ctx[7]),
    				listen(li5, "click", /*click_handler_6*/ ctx[8])
    			];
    		},
    		p(ctx, dirty) {
    			if (dirty & /*$visibility*/ 2) {
    				toggle_class(li0, "checked", /*$visibility*/ ctx[1].component);
    			}

    			if (dirty & /*$visibility*/ 2) {
    				toggle_class(li1, "checked", /*$visibility*/ ctx[1].element);
    			}

    			if (dirty & /*$visibility*/ 2) {
    				toggle_class(li2, "checked", /*$visibility*/ ctx[1].block);
    			}

    			if (dirty & /*$visibility*/ 2) {
    				toggle_class(li3, "checked", /*$visibility*/ ctx[1].slot);
    			}

    			if (dirty & /*$visibility*/ 2) {
    				toggle_class(li4, "checked", /*$visibility*/ ctx[1].anchor);
    			}

    			if (dirty & /*$visibility*/ 2) {
    				toggle_class(li5, "checked", /*$visibility*/ ctx[1].text);
    			}
    		},
    		d(detaching) {
    			if (detaching) detach(div);
    			if (detaching) detach(ul);
    			run_all(dispose);
    		}
    	};
    }

    // (89:11) <Button on:click={e => (isOpen = true)}>
    function create_default_slot$3(ctx) {
    	let svg;
    	let path;
    	let if_block_anchor;
    	let if_block = /*isOpen*/ ctx[0] && create_if_block$2(ctx);

    	return {
    		c() {
    			svg = svg_element("svg");
    			path = svg_element("path");
    			if (if_block) if_block.c();
    			if_block_anchor = empty();
    			attr(path, "d", "M8 2C4.36364 2 1.25818 4.28067 0 7.5 1.25818 10.71933 4.36364 13 8\n      13s6.74182-2.28067 8-5.5C14.74182 4.28067 11.63636 2 8 2zm0\n      9.16667c-2.00727 0-3.63636-1.64267-3.63636-3.66667S5.99273 3.83333 8\n      3.83333 11.63636 5.476 11.63636 7.5 10.00727 11.16667 8 11.16667zM8\n      5.3c-1.20727 0-2.18182.98267-2.18182 2.2S6.79273 9.7 8 9.7s2.18182-.98267\n      2.18182-2.2S9.20727 5.3 8 5.3z");
    			attr(svg, "xmlns", "http://www.w3.org/2000/svg");
    			attr(svg, "viewBox", "0 0 16 16");
    		},
    		m(target, anchor) {
    			insert(target, svg, anchor);
    			append(svg, path);
    			if (if_block) if_block.m(target, anchor);
    			insert(target, if_block_anchor, anchor);
    		},
    		p(ctx, dirty) {
    			if (/*isOpen*/ ctx[0]) {
    				if (if_block) {
    					if_block.p(ctx, dirty);
    				} else {
    					if_block = create_if_block$2(ctx);
    					if_block.c();
    					if_block.m(if_block_anchor.parentNode, if_block_anchor);
    				}
    			} else if (if_block) {
    				if_block.d(1);
    				if_block = null;
    			}
    		},
    		d(detaching) {
    			if (detaching) detach(svg);
    			if (if_block) if_block.d(detaching);
    			if (detaching) detach(if_block_anchor);
    		}
    	};
    }

    function create_fragment$5(ctx) {
    	let current;

    	const button = new Button({
    			props: {
    				$$slots: { default: [create_default_slot$3] },
    				$$scope: { ctx }
    			}
    		});

    	button.$on("click", /*click_handler_7*/ ctx[9]);

    	return {
    		c() {
    			create_component(button.$$.fragment);
    		},
    		m(target, anchor) {
    			mount_component(button, target, anchor);
    			current = true;
    		},
    		p(ctx, [dirty]) {
    			const button_changes = {};

    			if (dirty & /*$$scope, $visibility, isOpen*/ 1027) {
    				button_changes.$$scope = { dirty, ctx };
    			}

    			button.$set(button_changes);
    		},
    		i(local) {
    			if (current) return;
    			transition_in(button.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(button.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			destroy_component(button, detaching);
    		}
    	};
    }

    function instance$5($$self, $$props, $$invalidate) {
    	let $visibility;
    	component_subscribe($$self, visibility, $$value => $$invalidate(1, $visibility = $$value));
    	let isOpen = false;
    	const click_handler = e => $$invalidate(0, isOpen = false);
    	const click_handler_1 = e => set_store_value(visibility, $visibility.component = !$visibility.component, $visibility);
    	const click_handler_2 = e => set_store_value(visibility, $visibility.element = !$visibility.element, $visibility);
    	const click_handler_3 = e => set_store_value(visibility, $visibility.block = !$visibility.block, $visibility);
    	const click_handler_4 = e => set_store_value(visibility, $visibility.slot = !$visibility.slot, $visibility);
    	const click_handler_5 = e => set_store_value(visibility, $visibility.anchor = !$visibility.anchor, $visibility);
    	const click_handler_6 = e => set_store_value(visibility, $visibility.text = !$visibility.text, $visibility);
    	const click_handler_7 = e => $$invalidate(0, isOpen = true);

    	return [
    		isOpen,
    		$visibility,
    		click_handler,
    		click_handler_1,
    		click_handler_2,
    		click_handler_3,
    		click_handler_4,
    		click_handler_5,
    		click_handler_6,
    		click_handler_7
    	];
    }

    class VisibilityButton extends SvelteComponent {
    	constructor(options) {
    		super();
    		init(this, options, instance$5, create_fragment$5, safe_not_equal, {});
    	}
    }

    /* src/panel/Panel.svelte generated by Svelte v3.20.1 */

    const { window: window_1 } = globals;

    function create_fragment$6(ctx) {
    	let div1;
    	let div0;
    	let div0_class_value;
    	let div1_style_value;
    	let current;
    	let dispose;
    	const default_slot_template = /*$$slots*/ ctx[4].default;
    	const default_slot = create_slot(default_slot_template, ctx, /*$$scope*/ ctx[3], null);

    	return {
    		c() {
    			div1 = element("div");
    			div0 = element("div");
    			if (default_slot) default_slot.c();
    			attr(div0, "class", div0_class_value = "" + (/*grow*/ ctx[0] + " resize" + " svelte-1ckuoij"));
    			attr(div1, "style", div1_style_value = "" + ((/*grow*/ ctx[0] == "left" ? "width" : "height") + ": " + /*size*/ ctx[2] + "px"));
    			attr(div1, "class", "svelte-1ckuoij");
    		},
    		m(target, anchor, remount) {
    			insert(target, div1, anchor);
    			append(div1, div0);

    			if (default_slot) {
    				default_slot.m(div1, null);
    			}

    			current = true;
    			if (remount) run_all(dispose);

    			dispose = [
    				listen(window_1, "mousemove", /*mousemove_handler*/ ctx[5]),
    				listen(window_1, "mouseup", /*mouseup_handler*/ ctx[6]),
    				listen(div0, "mousedown", /*mousedown_handler*/ ctx[7])
    			];
    		},
    		p(ctx, [dirty]) {
    			if (!current || dirty & /*grow*/ 1 && div0_class_value !== (div0_class_value = "" + (/*grow*/ ctx[0] + " resize" + " svelte-1ckuoij"))) {
    				attr(div0, "class", div0_class_value);
    			}

    			if (default_slot) {
    				if (default_slot.p && dirty & /*$$scope*/ 8) {
    					default_slot.p(get_slot_context(default_slot_template, ctx, /*$$scope*/ ctx[3], null), get_slot_changes(default_slot_template, /*$$scope*/ ctx[3], dirty, null));
    				}
    			}

    			if (!current || dirty & /*grow, size*/ 5 && div1_style_value !== (div1_style_value = "" + ((/*grow*/ ctx[0] == "left" ? "width" : "height") + ": " + /*size*/ ctx[2] + "px"))) {
    				attr(div1, "style", div1_style_value);
    			}
    		},
    		i(local) {
    			if (current) return;
    			transition_in(default_slot, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(default_slot, local);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(div1);
    			if (default_slot) default_slot.d(detaching);
    			run_all(dispose);
    		}
    	};
    }

    function instance$6($$self, $$props, $$invalidate) {
    	let { grow = "left" } = $$props;
    	let isResizing = false;
    	let size = 300;
    	let { $$slots = {}, $$scope } = $$props;

    	const mousemove_handler = e => isResizing && $$invalidate(2, size = grow == "left"
    	? window.innerWidth - e.x
    	: window.innerHeight - e.y);

    	const mouseup_handler = e => $$invalidate(1, isResizing = false);
    	const mousedown_handler = e => $$invalidate(1, isResizing = true);

    	$$self.$set = $$props => {
    		if ("grow" in $$props) $$invalidate(0, grow = $$props.grow);
    		if ("$$scope" in $$props) $$invalidate(3, $$scope = $$props.$$scope);
    	};

    	return [
    		grow,
    		isResizing,
    		size,
    		$$scope,
    		$$slots,
    		mousemove_handler,
    		mouseup_handler,
    		mousedown_handler
    	];
    }

    class Panel extends SvelteComponent {
    	constructor(options) {
    		super();
    		init(this, options, instance$6, create_fragment$6, safe_not_equal, { grow: 0 });
    	}
    }

    /* src/nodes/Collapse.svelte generated by Svelte v3.20.1 */

    function create_fragment$7(ctx) {
    	let span;
    	let span_class_value;
    	let dispose;

    	return {
    		c() {
    			span = element("span");
    			attr(span, "class", span_class_value = "" + (null_to_empty(/*className*/ ctx[2]) + " svelte-s4v3qc"));
    			toggle_class(span, "selected", /*selected*/ ctx[1]);
    			toggle_class(span, "collapsed", /*collapsed*/ ctx[0]);
    		},
    		m(target, anchor, remount) {
    			insert(target, span, anchor);
    			if (remount) dispose();
    			dispose = listen(span, "click", /*click_handler*/ ctx[3]);
    		},
    		p(ctx, [dirty]) {
    			if (dirty & /*className*/ 4 && span_class_value !== (span_class_value = "" + (null_to_empty(/*className*/ ctx[2]) + " svelte-s4v3qc"))) {
    				attr(span, "class", span_class_value);
    			}

    			if (dirty & /*className, selected*/ 6) {
    				toggle_class(span, "selected", /*selected*/ ctx[1]);
    			}

    			if (dirty & /*className, collapsed*/ 5) {
    				toggle_class(span, "collapsed", /*collapsed*/ ctx[0]);
    			}
    		},
    		i: noop,
    		o: noop,
    		d(detaching) {
    			if (detaching) detach(span);
    			dispose();
    		}
    	};
    }

    function instance$7($$self, $$props, $$invalidate) {
    	let { selected = false } = $$props;
    	let { collapsed } = $$props;
    	let { class: className } = $$props;
    	const click_handler = e => $$invalidate(0, collapsed = !collapsed);

    	$$self.$set = $$props => {
    		if ("selected" in $$props) $$invalidate(1, selected = $$props.selected);
    		if ("collapsed" in $$props) $$invalidate(0, collapsed = $$props.collapsed);
    		if ("class" in $$props) $$invalidate(2, className = $$props.class);
    	};

    	return [collapsed, selected, className, click_handler];
    }

    class Collapse extends SvelteComponent {
    	constructor(options) {
    		super();
    		init(this, options, instance$7, create_fragment$7, safe_not_equal, { selected: 1, collapsed: 0, class: 2 });
    	}
    }

    /* src/panel/Editable.svelte generated by Svelte v3.20.1 */

    function create_else_block$1(ctx) {
    	let span;
    	let t_value = JSON.stringify(/*value*/ ctx[0]) + "";
    	let t;
    	let span_class_value;
    	let dispose;

    	return {
    		c() {
    			span = element("span");
    			t = text(t_value);
    			attr(span, "class", span_class_value = "" + (null_to_empty(/*className*/ ctx[2]) + " svelte-93fszb"));
    			toggle_class(span, "readOnly", /*readOnly*/ ctx[1]);
    		},
    		m(target, anchor, remount) {
    			insert(target, span, anchor);
    			append(span, t);
    			if (remount) dispose();
    			dispose = listen(span, "click", /*click_handler*/ ctx[9]);
    		},
    		p(ctx, dirty) {
    			if (dirty & /*value*/ 1 && t_value !== (t_value = JSON.stringify(/*value*/ ctx[0]) + "")) set_data(t, t_value);

    			if (dirty & /*className*/ 4 && span_class_value !== (span_class_value = "" + (null_to_empty(/*className*/ ctx[2]) + " svelte-93fszb"))) {
    				attr(span, "class", span_class_value);
    			}

    			if (dirty & /*className, readOnly*/ 6) {
    				toggle_class(span, "readOnly", /*readOnly*/ ctx[1]);
    			}
    		},
    		d(detaching) {
    			if (detaching) detach(span);
    			dispose();
    		}
    	};
    }

    // (34:11) {#if isEditing}
    function create_if_block$3(ctx) {
    	let input_1;
    	let input_1_value_value;
    	let dispose;

    	return {
    		c() {
    			input_1 = element("input");
    			input_1.value = input_1_value_value = JSON.stringify(/*value*/ ctx[0]);
    			attr(input_1, "class", "svelte-93fszb");
    		},
    		m(target, anchor, remount) {
    			insert(target, input_1, anchor);
    			/*input_1_binding*/ ctx[7](input_1);
    			if (remount) run_all(dispose);

    			dispose = [
    				listen(input_1, "keydown", /*keydown_handler*/ ctx[8]),
    				listen(input_1, "blur", /*commit*/ ctx[5])
    			];
    		},
    		p(ctx, dirty) {
    			if (dirty & /*value*/ 1 && input_1_value_value !== (input_1_value_value = JSON.stringify(/*value*/ ctx[0])) && input_1.value !== input_1_value_value) {
    				input_1.value = input_1_value_value;
    			}
    		},
    		d(detaching) {
    			if (detaching) detach(input_1);
    			/*input_1_binding*/ ctx[7](null);
    			run_all(dispose);
    		}
    	};
    }

    function create_fragment$8(ctx) {
    	let if_block_anchor;

    	function select_block_type(ctx, dirty) {
    		if (/*isEditing*/ ctx[3]) return create_if_block$3;
    		return create_else_block$1;
    	}

    	let current_block_type = select_block_type(ctx);
    	let if_block = current_block_type(ctx);

    	return {
    		c() {
    			if_block.c();
    			if_block_anchor = empty();
    		},
    		m(target, anchor) {
    			if_block.m(target, anchor);
    			insert(target, if_block_anchor, anchor);
    		},
    		p(ctx, [dirty]) {
    			if (current_block_type === (current_block_type = select_block_type(ctx)) && if_block) {
    				if_block.p(ctx, dirty);
    			} else {
    				if_block.d(1);
    				if_block = current_block_type(ctx);

    				if (if_block) {
    					if_block.c();
    					if_block.m(if_block_anchor.parentNode, if_block_anchor);
    				}
    			}
    		},
    		i: noop,
    		o: noop,
    		d(detaching) {
    			if_block.d(detaching);
    			if (detaching) detach(if_block_anchor);
    		}
    	};
    }

    function instance$8($$self, $$props, $$invalidate) {
    	let { value } = $$props;
    	let { readOnly } = $$props;
    	let { class: className } = $$props;
    	const dispatch = createEventDispatcher();

    	function commit(e) {
    		$$invalidate(3, isEditing = false);
    		dispatch("change", e.target.value);
    	}

    	let isEditing = false;
    	let input;

    	function input_1_binding($$value) {
    		binding_callbacks[$$value ? "unshift" : "push"](() => {
    			$$invalidate(4, input = $$value);
    		});
    	}

    	const keydown_handler = e => e.key == "Enter" && commit(e);
    	const click_handler = () => $$invalidate(3, isEditing = !readOnly);

    	$$self.$set = $$props => {
    		if ("value" in $$props) $$invalidate(0, value = $$props.value);
    		if ("readOnly" in $$props) $$invalidate(1, readOnly = $$props.readOnly);
    		if ("class" in $$props) $$invalidate(2, className = $$props.class);
    	};

    	$$self.$$.update = () => {
    		if ($$self.$$.dirty & /*input*/ 16) {
    			 if (input) input.select();
    		}
    	};

    	return [
    		value,
    		readOnly,
    		className,
    		isEditing,
    		input,
    		commit,
    		dispatch,
    		input_1_binding,
    		keydown_handler,
    		click_handler
    	];
    }

    class Editable extends SvelteComponent {
    	constructor(options) {
    		super();
    		init(this, options, instance$8, create_fragment$8, safe_not_equal, { value: 0, readOnly: 1, class: 2 });
    	}
    }

    /* src/panel/CollapsableValue.svelte generated by Svelte v3.20.1 */

    function get_each_context_1(ctx, list, i) {
    	const child_ctx = ctx.slice();
    	child_ctx[3] = list[i][0];
    	child_ctx[13] = list[i][1];
    	return child_ctx;
    }

    function get_each_context(ctx, list, i) {
    	const child_ctx = ctx.slice();
    	child_ctx[13] = list[i];
    	child_ctx[3] = i;
    	return child_ctx;
    }

    // (95:189) 
    function create_if_block_7(ctx) {
    	let show_if;
    	let current_block_type_index;
    	let if_block;
    	let if_block_anchor;
    	let current;
    	const if_block_creators = [create_if_block_8, create_if_block_10, create_if_block_11, create_else_block_1];
    	const if_blocks = [];

    	function select_block_type_2(ctx, dirty) {
    		if (/*value*/ ctx[2].__isFunction) return 0;
    		if (/*value*/ ctx[2].__isSymbol) return 1;
    		if (dirty & /*value*/ 4) show_if = !!Object.keys(/*value*/ ctx[2]).length;
    		if (show_if) return 2;
    		return 3;
    	}

    	current_block_type_index = select_block_type_2(ctx, -1);
    	if_block = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);

    	return {
    		c() {
    			if_block.c();
    			if_block_anchor = empty();
    		},
    		m(target, anchor) {
    			if_blocks[current_block_type_index].m(target, anchor);
    			insert(target, if_block_anchor, anchor);
    			current = true;
    		},
    		p(ctx, dirty) {
    			let previous_block_index = current_block_type_index;
    			current_block_type_index = select_block_type_2(ctx, dirty);

    			if (current_block_type_index === previous_block_index) {
    				if_blocks[current_block_type_index].p(ctx, dirty);
    			} else {
    				group_outros();

    				transition_out(if_blocks[previous_block_index], 1, 1, () => {
    					if_blocks[previous_block_index] = null;
    				});

    				check_outros();
    				if_block = if_blocks[current_block_type_index];

    				if (!if_block) {
    					if_block = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);
    					if_block.c();
    				}

    				transition_in(if_block, 1);
    				if_block.m(if_block_anchor.parentNode, if_block_anchor);
    			}
    		},
    		i(local) {
    			if (current) return;
    			transition_in(if_block);
    			current = true;
    		},
    		o(local) {
    			transition_out(if_block);
    			current = false;
    		},
    		d(detaching) {
    			if_blocks[current_block_type_index].d(detaching);
    			if (detaching) detach(if_block_anchor);
    		}
    	};
    }

    // (91:426) 
    function create_if_block_4(ctx) {
    	let current_block_type_index;
    	let if_block;
    	let if_block_anchor;
    	let current;
    	const if_block_creators = [create_if_block_5, create_else_block$2];
    	const if_blocks = [];

    	function select_block_type_1(ctx, dirty) {
    		if (/*value*/ ctx[2].length) return 0;
    		return 1;
    	}

    	current_block_type_index = select_block_type_1(ctx);
    	if_block = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);

    	return {
    		c() {
    			if_block.c();
    			if_block_anchor = empty();
    		},
    		m(target, anchor) {
    			if_blocks[current_block_type_index].m(target, anchor);
    			insert(target, if_block_anchor, anchor);
    			current = true;
    		},
    		p(ctx, dirty) {
    			let previous_block_index = current_block_type_index;
    			current_block_type_index = select_block_type_1(ctx);

    			if (current_block_type_index === previous_block_index) {
    				if_blocks[current_block_type_index].p(ctx, dirty);
    			} else {
    				group_outros();

    				transition_out(if_blocks[previous_block_index], 1, 1, () => {
    					if_blocks[previous_block_index] = null;
    				});

    				check_outros();
    				if_block = if_blocks[current_block_type_index];

    				if (!if_block) {
    					if_block = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);
    					if_block.c();
    				}

    				transition_in(if_block, 1);
    				if_block.m(if_block_anchor.parentNode, if_block_anchor);
    			}
    		},
    		i(local) {
    			if (current) return;
    			transition_in(if_block);
    			current = true;
    		},
    		o(local) {
    			transition_out(if_block);
    			current = false;
    		},
    		d(detaching) {
    			if_blocks[current_block_type_index].d(detaching);
    			if (detaching) detach(if_block_anchor);
    		}
    	};
    }

    // (91:327) 
    function create_if_block_3(ctx) {
    	let t0;
    	let t1;
    	let current;

    	const editable = new Editable({
    			props: {
    				class: "number",
    				readOnly: /*readOnly*/ ctx[1],
    				value: /*value*/ ctx[2]
    			}
    		});

    	editable.$on("change", /*change_handler_2*/ ctx[9]);

    	return {
    		c() {
    			t0 = text(/*key*/ ctx[3]);
    			t1 = text(": ");
    			create_component(editable.$$.fragment);
    		},
    		m(target, anchor) {
    			insert(target, t0, anchor);
    			insert(target, t1, anchor);
    			mount_component(editable, target, anchor);
    			current = true;
    		},
    		p(ctx, dirty) {
    			if (!current || dirty & /*key*/ 8) set_data(t0, /*key*/ ctx[3]);
    			const editable_changes = {};
    			if (dirty & /*readOnly*/ 2) editable_changes.readOnly = /*readOnly*/ ctx[1];
    			if (dirty & /*value*/ 4) editable_changes.value = /*value*/ ctx[2];
    			editable.$set(editable_changes);
    		},
    		i(local) {
    			if (current) return;
    			transition_in(editable.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(editable.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(t0);
    			if (detaching) detach(t1);
    			destroy_component(editable, detaching);
    		}
    	};
    }

    // (91:213) 
    function create_if_block_2(ctx) {
    	let t0;
    	let t1;
    	let current;

    	const editable = new Editable({
    			props: {
    				class: "null",
    				readOnly: /*readOnly*/ ctx[1],
    				value: /*value*/ ctx[2]
    			}
    		});

    	editable.$on("change", /*change_handler_1*/ ctx[8]);

    	return {
    		c() {
    			t0 = text(/*key*/ ctx[3]);
    			t1 = text(": ");
    			create_component(editable.$$.fragment);
    		},
    		m(target, anchor) {
    			insert(target, t0, anchor);
    			insert(target, t1, anchor);
    			mount_component(editable, target, anchor);
    			current = true;
    		},
    		p(ctx, dirty) {
    			if (!current || dirty & /*key*/ 8) set_data(t0, /*key*/ ctx[3]);
    			const editable_changes = {};
    			if (dirty & /*readOnly*/ 2) editable_changes.readOnly = /*readOnly*/ ctx[1];
    			if (dirty & /*value*/ 4) editable_changes.value = /*value*/ ctx[2];
    			editable.$set(editable_changes);
    		},
    		i(local) {
    			if (current) return;
    			transition_in(editable.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(editable.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(t0);
    			if (detaching) detach(t1);
    			destroy_component(editable, detaching);
    		}
    	};
    }

    // (91:59) {#if type == 'string'}
    function create_if_block_1(ctx) {
    	let t0;
    	let t1;
    	let current;

    	const editable = new Editable({
    			props: {
    				class: "string",
    				readOnly: /*readOnly*/ ctx[1],
    				value: /*value*/ ctx[2]
    			}
    		});

    	editable.$on("change", /*change_handler*/ ctx[7]);

    	return {
    		c() {
    			t0 = text(/*key*/ ctx[3]);
    			t1 = text(": ");
    			create_component(editable.$$.fragment);
    		},
    		m(target, anchor) {
    			insert(target, t0, anchor);
    			insert(target, t1, anchor);
    			mount_component(editable, target, anchor);
    			current = true;
    		},
    		p(ctx, dirty) {
    			if (!current || dirty & /*key*/ 8) set_data(t0, /*key*/ ctx[3]);
    			const editable_changes = {};
    			if (dirty & /*readOnly*/ 2) editable_changes.readOnly = /*readOnly*/ ctx[1];
    			if (dirty & /*value*/ 4) editable_changes.value = /*value*/ ctx[2];
    			editable.$set(editable_changes);
    		},
    		i(local) {
    			if (current) return;
    			transition_in(editable.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(editable.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(t0);
    			if (detaching) detach(t1);
    			destroy_component(editable, detaching);
    		}
    	};
    }

    // (99:102) {:else}
    function create_else_block_1(ctx) {
    	let t0;
    	let t1;
    	let span;

    	return {
    		c() {
    			t0 = text(/*key*/ ctx[3]);
    			t1 = text(": ");
    			span = element("span");
    			span.textContent = "Object { }";
    			attr(span, "class", "object svelte-1x87zkp");
    		},
    		m(target, anchor) {
    			insert(target, t0, anchor);
    			insert(target, t1, anchor);
    			insert(target, span, anchor);
    		},
    		p(ctx, dirty) {
    			if (dirty & /*key*/ 8) set_data(t0, /*key*/ ctx[3]);
    		},
    		i: noop,
    		o: noop,
    		d(detaching) {
    			if (detaching) detach(t0);
    			if (detaching) detach(t1);
    			if (detaching) detach(span);
    		}
    	};
    }

    // (95:511) 
    function create_if_block_11(ctx) {
    	let t0;
    	let t1;
    	let span;
    	let if_block_anchor;
    	let current;

    	const collapse = new Collapse({
    			props: {
    				class: "collapse",
    				collapsed: /*collapsed*/ ctx[4]
    			}
    		});

    	let if_block = !/*collapsed*/ ctx[4] && create_if_block_12(ctx);

    	return {
    		c() {
    			create_component(collapse.$$.fragment);
    			t0 = text(/*key*/ ctx[3]);
    			t1 = text(": ");
    			span = element("span");
    			span.textContent = "Object {…}";
    			if (if_block) if_block.c();
    			if_block_anchor = empty();
    			attr(span, "class", "object svelte-1x87zkp");
    		},
    		m(target, anchor) {
    			mount_component(collapse, target, anchor);
    			insert(target, t0, anchor);
    			insert(target, t1, anchor);
    			insert(target, span, anchor);
    			if (if_block) if_block.m(target, anchor);
    			insert(target, if_block_anchor, anchor);
    			current = true;
    		},
    		p(ctx, dirty) {
    			const collapse_changes = {};
    			if (dirty & /*collapsed*/ 16) collapse_changes.collapsed = /*collapsed*/ ctx[4];
    			collapse.$set(collapse_changes);
    			if (!current || dirty & /*key*/ 8) set_data(t0, /*key*/ ctx[3]);

    			if (!/*collapsed*/ ctx[4]) {
    				if (if_block) {
    					if_block.p(ctx, dirty);
    					transition_in(if_block, 1);
    				} else {
    					if_block = create_if_block_12(ctx);
    					if_block.c();
    					transition_in(if_block, 1);
    					if_block.m(if_block_anchor.parentNode, if_block_anchor);
    				}
    			} else if (if_block) {
    				group_outros();

    				transition_out(if_block, 1, 1, () => {
    					if_block = null;
    				});

    				check_outros();
    			}
    		},
    		i(local) {
    			if (current) return;
    			transition_in(collapse.$$.fragment, local);
    			transition_in(if_block);
    			current = true;
    		},
    		o(local) {
    			transition_out(collapse.$$.fragment, local);
    			transition_out(if_block);
    			current = false;
    		},
    		d(detaching) {
    			destroy_component(collapse, detaching);
    			if (detaching) detach(t0);
    			if (detaching) detach(t1);
    			if (detaching) detach(span);
    			if (if_block) if_block.d(detaching);
    			if (detaching) detach(if_block_anchor);
    		}
    	};
    }

    // (95:409) 
    function create_if_block_10(ctx) {
    	let t0;
    	let t1;
    	let span;
    	let t2_value = (/*value*/ ctx[2].name || "Symbol()") + "";
    	let t2;

    	return {
    		c() {
    			t0 = text(/*key*/ ctx[3]);
    			t1 = text(": ");
    			span = element("span");
    			t2 = text(t2_value);
    			attr(span, "class", "symbol svelte-1x87zkp");
    		},
    		m(target, anchor) {
    			insert(target, t0, anchor);
    			insert(target, t1, anchor);
    			insert(target, span, anchor);
    			append(span, t2);
    		},
    		p(ctx, dirty) {
    			if (dirty & /*key*/ 8) set_data(t0, /*key*/ ctx[3]);
    			if (dirty & /*value*/ 4 && t2_value !== (t2_value = (/*value*/ ctx[2].name || "Symbol()") + "")) set_data(t2, t2_value);
    		},
    		i: noop,
    		o: noop,
    		d(detaching) {
    			if (detaching) detach(t0);
    			if (detaching) detach(t1);
    			if (detaching) detach(span);
    		}
    	};
    }

    // (95:189) {#if value.__isFunction}
    function create_if_block_8(ctx) {
    	let t0;
    	let t1;
    	let span;
    	let t2;
    	let t3_value = (/*value*/ ctx[2].name || "") + "";
    	let t3;
    	let t4;
    	let if_block_anchor;
    	let current;

    	const collapse = new Collapse({
    			props: {
    				class: "collapse",
    				collapsed: /*collapsed*/ ctx[4]
    			}
    		});

    	let if_block = !/*collapsed*/ ctx[4] && create_if_block_9(ctx);

    	return {
    		c() {
    			create_component(collapse.$$.fragment);
    			t0 = text(/*key*/ ctx[3]);
    			t1 = text(": ");
    			span = element("span");
    			t2 = text("function ");
    			t3 = text(t3_value);
    			t4 = text(" ()");
    			if (if_block) if_block.c();
    			if_block_anchor = empty();
    			attr(span, "class", "function svelte-1x87zkp");
    		},
    		m(target, anchor) {
    			mount_component(collapse, target, anchor);
    			insert(target, t0, anchor);
    			insert(target, t1, anchor);
    			insert(target, span, anchor);
    			append(span, t2);
    			append(span, t3);
    			append(span, t4);
    			if (if_block) if_block.m(target, anchor);
    			insert(target, if_block_anchor, anchor);
    			current = true;
    		},
    		p(ctx, dirty) {
    			const collapse_changes = {};
    			if (dirty & /*collapsed*/ 16) collapse_changes.collapsed = /*collapsed*/ ctx[4];
    			collapse.$set(collapse_changes);
    			if (!current || dirty & /*key*/ 8) set_data(t0, /*key*/ ctx[3]);
    			if ((!current || dirty & /*value*/ 4) && t3_value !== (t3_value = (/*value*/ ctx[2].name || "") + "")) set_data(t3, t3_value);

    			if (!/*collapsed*/ ctx[4]) {
    				if (if_block) {
    					if_block.p(ctx, dirty);
    				} else {
    					if_block = create_if_block_9(ctx);
    					if_block.c();
    					if_block.m(if_block_anchor.parentNode, if_block_anchor);
    				}
    			} else if (if_block) {
    				if_block.d(1);
    				if_block = null;
    			}
    		},
    		i(local) {
    			if (current) return;
    			transition_in(collapse.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(collapse.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			destroy_component(collapse, detaching);
    			if (detaching) detach(t0);
    			if (detaching) detach(t1);
    			if (detaching) detach(span);
    			if (if_block) if_block.d(detaching);
    			if (detaching) detach(if_block_anchor);
    		}
    	};
    }

    // (95:623) {#if !collapsed}
    function create_if_block_12(ctx) {
    	let ul;
    	let each_blocks = [];
    	let each_1_lookup = new Map();
    	let current;
    	let each_value_1 = Object.entries(/*value*/ ctx[2]);
    	const get_key = ctx => /*key*/ ctx[3];

    	for (let i = 0; i < each_value_1.length; i += 1) {
    		let child_ctx = get_each_context_1(ctx, each_value_1, i);
    		let key = get_key(child_ctx);
    		each_1_lookup.set(key, each_blocks[i] = create_each_block_1(key, child_ctx));
    	}

    	return {
    		c() {
    			ul = element("ul");

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].c();
    			}

    			attr(ul, "class", "svelte-1x87zkp");
    		},
    		m(target, anchor) {
    			insert(target, ul, anchor);

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].m(ul, null);
    			}

    			current = true;
    		},
    		p(ctx, dirty) {
    			if (dirty & /*readOnly, Object, value, dispatch, stringify*/ 70) {
    				const each_value_1 = Object.entries(/*value*/ ctx[2]);
    				group_outros();
    				each_blocks = update_keyed_each(each_blocks, dirty, get_key, 1, ctx, each_value_1, each_1_lookup, ul, outro_and_destroy_block, create_each_block_1, null, get_each_context_1);
    				check_outros();
    			}
    		},
    		i(local) {
    			if (current) return;

    			for (let i = 0; i < each_value_1.length; i += 1) {
    				transition_in(each_blocks[i]);
    			}

    			current = true;
    		},
    		o(local) {
    			for (let i = 0; i < each_blocks.length; i += 1) {
    				transition_out(each_blocks[i]);
    			}

    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(ul);

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].d();
    			}
    		}
    	};
    }

    // (95:643) {#each Object.entries(value) as [key, v] (key)}
    function create_each_block_1(key_2, ctx) {
    	let first;
    	let current;

    	function change_handler_4(...args) {
    		return /*change_handler_4*/ ctx[11](/*key*/ ctx[3], ...args);
    	}

    	const collapsablevalue = new CollapsableValue({
    			props: {
    				readOnly: /*readOnly*/ ctx[1],
    				key: /*key*/ ctx[3],
    				value: /*v*/ ctx[13]
    			}
    		});

    	collapsablevalue.$on("change", change_handler_4);

    	return {
    		key: key_2,
    		first: null,
    		c() {
    			first = empty();
    			create_component(collapsablevalue.$$.fragment);
    			this.first = first;
    		},
    		m(target, anchor) {
    			insert(target, first, anchor);
    			mount_component(collapsablevalue, target, anchor);
    			current = true;
    		},
    		p(new_ctx, dirty) {
    			ctx = new_ctx;
    			const collapsablevalue_changes = {};
    			if (dirty & /*readOnly*/ 2) collapsablevalue_changes.readOnly = /*readOnly*/ ctx[1];
    			if (dirty & /*value*/ 4) collapsablevalue_changes.key = /*key*/ ctx[3];
    			if (dirty & /*value*/ 4) collapsablevalue_changes.value = /*v*/ ctx[13];
    			collapsablevalue.$set(collapsablevalue_changes);
    		},
    		i(local) {
    			if (current) return;
    			transition_in(collapsablevalue.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(collapsablevalue.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(first);
    			destroy_component(collapsablevalue, detaching);
    		}
    	};
    }

    // (95:336) {#if !collapsed}
    function create_if_block_9(ctx) {
    	let pre;
    	let t_value = /*value*/ ctx[2].source + "";
    	let t;

    	return {
    		c() {
    			pre = element("pre");
    			t = text(t_value);
    		},
    		m(target, anchor) {
    			insert(target, pre, anchor);
    			append(pre, t);
    		},
    		p(ctx, dirty) {
    			if (dirty & /*value*/ 4 && t_value !== (t_value = /*value*/ ctx[2].source + "")) set_data(t, t_value);
    		},
    		d(detaching) {
    			if (detaching) detach(pre);
    		}
    	};
    }

    // (95:102) {:else}
    function create_else_block$2(ctx) {
    	let t0;
    	let t1;
    	let span;

    	return {
    		c() {
    			t0 = text(/*key*/ ctx[3]);
    			t1 = text(": ");
    			span = element("span");
    			span.textContent = "Array []";
    			attr(span, "class", "object svelte-1x87zkp");
    		},
    		m(target, anchor) {
    			insert(target, t0, anchor);
    			insert(target, t1, anchor);
    			insert(target, span, anchor);
    		},
    		p(ctx, dirty) {
    			if (dirty & /*key*/ 8) set_data(t0, /*key*/ ctx[3]);
    		},
    		i: noop,
    		o: noop,
    		d(detaching) {
    			if (detaching) detach(t0);
    			if (detaching) detach(t1);
    			if (detaching) detach(span);
    		}
    	};
    }

    // (91:426) {#if value.length}
    function create_if_block_5(ctx) {
    	let t0;
    	let t1;
    	let span;
    	let t2;
    	let t3_value = /*value*/ ctx[2].length + "";
    	let t3;
    	let t4;
    	let if_block_anchor;
    	let current;

    	const collapse = new Collapse({
    			props: {
    				class: "collapse",
    				collapsed: /*collapsed*/ ctx[4]
    			}
    		});

    	let if_block = !/*collapsed*/ ctx[4] && create_if_block_6(ctx);

    	return {
    		c() {
    			create_component(collapse.$$.fragment);
    			t0 = text(/*key*/ ctx[3]);
    			t1 = text(": ");
    			span = element("span");
    			t2 = text("Array [");
    			t3 = text(t3_value);
    			t4 = text("]");
    			if (if_block) if_block.c();
    			if_block_anchor = empty();
    			attr(span, "class", "object svelte-1x87zkp");
    		},
    		m(target, anchor) {
    			mount_component(collapse, target, anchor);
    			insert(target, t0, anchor);
    			insert(target, t1, anchor);
    			insert(target, span, anchor);
    			append(span, t2);
    			append(span, t3);
    			append(span, t4);
    			if (if_block) if_block.m(target, anchor);
    			insert(target, if_block_anchor, anchor);
    			current = true;
    		},
    		p(ctx, dirty) {
    			const collapse_changes = {};
    			if (dirty & /*collapsed*/ 16) collapse_changes.collapsed = /*collapsed*/ ctx[4];
    			collapse.$set(collapse_changes);
    			if (!current || dirty & /*key*/ 8) set_data(t0, /*key*/ ctx[3]);
    			if ((!current || dirty & /*value*/ 4) && t3_value !== (t3_value = /*value*/ ctx[2].length + "")) set_data(t3, t3_value);

    			if (!/*collapsed*/ ctx[4]) {
    				if (if_block) {
    					if_block.p(ctx, dirty);
    					transition_in(if_block, 1);
    				} else {
    					if_block = create_if_block_6(ctx);
    					if_block.c();
    					transition_in(if_block, 1);
    					if_block.m(if_block_anchor.parentNode, if_block_anchor);
    				}
    			} else if (if_block) {
    				group_outros();

    				transition_out(if_block, 1, 1, () => {
    					if_block = null;
    				});

    				check_outros();
    			}
    		},
    		i(local) {
    			if (current) return;
    			transition_in(collapse.$$.fragment, local);
    			transition_in(if_block);
    			current = true;
    		},
    		o(local) {
    			transition_out(collapse.$$.fragment, local);
    			transition_out(if_block);
    			current = false;
    		},
    		d(detaching) {
    			destroy_component(collapse, detaching);
    			if (detaching) detach(t0);
    			if (detaching) detach(t1);
    			if (detaching) detach(span);
    			if (if_block) if_block.d(detaching);
    			if (detaching) detach(if_block_anchor);
    		}
    	};
    }

    // (91:547) {#if !collapsed}
    function create_if_block_6(ctx) {
    	let ul;
    	let current;
    	let each_value = /*value*/ ctx[2];
    	let each_blocks = [];

    	for (let i = 0; i < each_value.length; i += 1) {
    		each_blocks[i] = create_each_block(get_each_context(ctx, each_value, i));
    	}

    	const out = i => transition_out(each_blocks[i], 1, 1, () => {
    		each_blocks[i] = null;
    	});

    	return {
    		c() {
    			ul = element("ul");

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].c();
    			}

    			attr(ul, "class", "svelte-1x87zkp");
    		},
    		m(target, anchor) {
    			insert(target, ul, anchor);

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].m(ul, null);
    			}

    			current = true;
    		},
    		p(ctx, dirty) {
    			if (dirty & /*readOnly, value, dispatch, stringify*/ 70) {
    				each_value = /*value*/ ctx[2];
    				let i;

    				for (i = 0; i < each_value.length; i += 1) {
    					const child_ctx = get_each_context(ctx, each_value, i);

    					if (each_blocks[i]) {
    						each_blocks[i].p(child_ctx, dirty);
    						transition_in(each_blocks[i], 1);
    					} else {
    						each_blocks[i] = create_each_block(child_ctx);
    						each_blocks[i].c();
    						transition_in(each_blocks[i], 1);
    						each_blocks[i].m(ul, null);
    					}
    				}

    				group_outros();

    				for (i = each_value.length; i < each_blocks.length; i += 1) {
    					out(i);
    				}

    				check_outros();
    			}
    		},
    		i(local) {
    			if (current) return;

    			for (let i = 0; i < each_value.length; i += 1) {
    				transition_in(each_blocks[i]);
    			}

    			current = true;
    		},
    		o(local) {
    			each_blocks = each_blocks.filter(Boolean);

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				transition_out(each_blocks[i]);
    			}

    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(ul);
    			destroy_each(each_blocks, detaching);
    		}
    	};
    }

    // (91:567) {#each value as v, key}
    function create_each_block(ctx) {
    	let current;

    	function change_handler_3(...args) {
    		return /*change_handler_3*/ ctx[10](/*key*/ ctx[3], ...args);
    	}

    	const collapsablevalue = new CollapsableValue({
    			props: {
    				readOnly: /*readOnly*/ ctx[1],
    				key: /*key*/ ctx[3],
    				value: /*v*/ ctx[13]
    			}
    		});

    	collapsablevalue.$on("change", change_handler_3);

    	return {
    		c() {
    			create_component(collapsablevalue.$$.fragment);
    		},
    		m(target, anchor) {
    			mount_component(collapsablevalue, target, anchor);
    			current = true;
    		},
    		p(new_ctx, dirty) {
    			ctx = new_ctx;
    			const collapsablevalue_changes = {};
    			if (dirty & /*readOnly*/ 2) collapsablevalue_changes.readOnly = /*readOnly*/ ctx[1];
    			if (dirty & /*value*/ 4) collapsablevalue_changes.value = /*v*/ ctx[13];
    			collapsablevalue.$set(collapsablevalue_changes);
    		},
    		i(local) {
    			if (current) return;
    			transition_in(collapsablevalue.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(collapsablevalue.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			destroy_component(collapsablevalue, detaching);
    		}
    	};
    }

    // (99:183) {#if errorMessage}
    function create_if_block$4(ctx) {
    	let span;

    	return {
    		c() {
    			span = element("span");
    			span.textContent = "!";
    			attr(span, "class", "error svelte-1x87zkp");
    		},
    		m(target, anchor) {
    			insert(target, span, anchor);
    		},
    		d(detaching) {
    			if (detaching) detach(span);
    		}
    	};
    }

    function create_fragment$9(ctx) {
    	let li;
    	let show_if;
    	let current_block_type_index;
    	let if_block0;
    	let if_block0_anchor;
    	let current;
    	let dispose;

    	const if_block_creators = [
    		create_if_block_1,
    		create_if_block_2,
    		create_if_block_3,
    		create_if_block_4,
    		create_if_block_7
    	];

    	const if_blocks = [];

    	function select_block_type(ctx, dirty) {
    		if (/*type*/ ctx[5] == "string") return 0;
    		if (/*value*/ ctx[2] == null || /*value*/ ctx[2] == undefined || /*value*/ ctx[2] != /*value*/ ctx[2]) return 1;
    		if (/*type*/ ctx[5] == "number" || /*type*/ ctx[5] == "boolean") return 2;
    		if (dirty & /*value*/ 4) show_if = !!Array.isArray(/*value*/ ctx[2]);
    		if (show_if) return 3;
    		if (/*type*/ ctx[5] == "object") return 4;
    		return -1;
    	}

    	if (~(current_block_type_index = select_block_type(ctx, -1))) {
    		if_block0 = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);
    	}

    	let if_block1 = /*errorMessage*/ ctx[0] && create_if_block$4();
    	let li_levels = [{ "data-tooltip": /*errorMessage*/ ctx[0] }];
    	let li_data = {};

    	for (let i = 0; i < li_levels.length; i += 1) {
    		li_data = assign(li_data, li_levels[i]);
    	}

    	return {
    		c() {
    			li = element("li");
    			if (if_block0) if_block0.c();
    			if_block0_anchor = empty();
    			if (if_block1) if_block1.c();
    			set_attributes(li, li_data);
    			toggle_class(li, "svelte-1x87zkp", true);
    		},
    		m(target, anchor, remount) {
    			insert(target, li, anchor);

    			if (~current_block_type_index) {
    				if_blocks[current_block_type_index].m(li, null);
    			}

    			append(li, if_block0_anchor);
    			if (if_block1) if_block1.m(li, null);
    			current = true;
    			if (remount) dispose();
    			dispose = listen(li, "click", stop_propagation(/*click_handler*/ ctx[12]));
    		},
    		p(ctx, [dirty]) {
    			let previous_block_index = current_block_type_index;
    			current_block_type_index = select_block_type(ctx, dirty);

    			if (current_block_type_index === previous_block_index) {
    				if (~current_block_type_index) {
    					if_blocks[current_block_type_index].p(ctx, dirty);
    				}
    			} else {
    				if (if_block0) {
    					group_outros();

    					transition_out(if_blocks[previous_block_index], 1, 1, () => {
    						if_blocks[previous_block_index] = null;
    					});

    					check_outros();
    				}

    				if (~current_block_type_index) {
    					if_block0 = if_blocks[current_block_type_index];

    					if (!if_block0) {
    						if_block0 = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);
    						if_block0.c();
    					}

    					transition_in(if_block0, 1);
    					if_block0.m(li, if_block0_anchor);
    				} else {
    					if_block0 = null;
    				}
    			}

    			if (/*errorMessage*/ ctx[0]) {
    				if (!if_block1) {
    					if_block1 = create_if_block$4();
    					if_block1.c();
    					if_block1.m(li, null);
    				}
    			} else if (if_block1) {
    				if_block1.d(1);
    				if_block1 = null;
    			}

    			set_attributes(li, get_spread_update(li_levels, [dirty & /*errorMessage*/ 1 && { "data-tooltip": /*errorMessage*/ ctx[0] }]));
    			toggle_class(li, "svelte-1x87zkp", true);
    		},
    		i(local) {
    			if (current) return;
    			transition_in(if_block0);
    			current = true;
    		},
    		o(local) {
    			transition_out(if_block0);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(li);

    			if (~current_block_type_index) {
    				if_blocks[current_block_type_index].d();
    			}

    			if (if_block1) if_block1.d();
    			dispose();
    		}
    	};
    }

    function stringify(value, k, v) {
    	if (Array.isArray(value)) return `[${value.map((value, i) => i == k ? v : stringify(value)).join(",")}]`;
    	if (value === null) return "null";
    	if (value === undefined) return "undefined";

    	switch (typeof value) {
    		case "string":
    			return `"${value}"`;
    		case "number":
    			return value.toString();
    		case "object":
    			return `{${Object.entries(value).map(([key, value]) => `"${key}":${key == k ? v : stringify(value)}`).join(",")}}`;
    	}
    }

    function instance$9($$self, $$props, $$invalidate) {
    	let { errorMessage } = $$props;
    	let { readOnly } = $$props;
    	let { value } = $$props;
    	let { key } = $$props;
    	const dispatch = createEventDispatcher();
    	let collapsed = true;

    	function change_handler(event) {
    		bubble($$self, event);
    	}

    	function change_handler_1(event) {
    		bubble($$self, event);
    	}

    	function change_handler_2(event) {
    		bubble($$self, event);
    	}

    	const change_handler_3 = (key, e) => dispatch("change", stringify(value, key, e.detail));
    	const change_handler_4 = (key, e) => dispatch("change", stringify(value, key, e.detail));
    	const click_handler = e => $$invalidate(4, collapsed = !collapsed);

    	$$self.$set = $$props => {
    		if ("errorMessage" in $$props) $$invalidate(0, errorMessage = $$props.errorMessage);
    		if ("readOnly" in $$props) $$invalidate(1, readOnly = $$props.readOnly);
    		if ("value" in $$props) $$invalidate(2, value = $$props.value);
    		if ("key" in $$props) $$invalidate(3, key = $$props.key);
    	};

    	let type;

    	$$self.$$.update = () => {
    		if ($$self.$$.dirty & /*value*/ 4) {
    			 $$invalidate(5, type = typeof value);
    		}
    	};

    	return [
    		errorMessage,
    		readOnly,
    		value,
    		key,
    		collapsed,
    		type,
    		dispatch,
    		change_handler,
    		change_handler_1,
    		change_handler_2,
    		change_handler_3,
    		change_handler_4,
    		click_handler
    	];
    }

    class CollapsableValue extends SvelteComponent {
    	constructor(options) {
    		super();

    		init(this, options, instance$9, create_fragment$9, safe_not_equal, {
    			errorMessage: 0,
    			readOnly: 1,
    			value: 2,
    			key: 3
    		});
    	}
    }

    /* src/panel/PropertyList.svelte generated by Svelte v3.20.1 */

    function get_each_context$1(ctx, list, i) {
    	const child_ctx = ctx.slice();
    	child_ctx[7] = list[i].key;
    	child_ctx[8] = list[i].value;
    	return child_ctx;
    }

    // (48:61) {:else}
    function create_else_block$3(ctx) {
    	let div;

    	return {
    		c() {
    			div = element("div");
    			div.textContent = "None";
    			attr(div, "class", "empty svelte-hrybu5");
    		},
    		m(target, anchor) {
    			insert(target, div, anchor);
    		},
    		p: noop,
    		i: noop,
    		o: noop,
    		d(detaching) {
    			if (detaching) detach(div);
    		}
    	};
    }

    // (43:28) {#if entries.length}
    function create_if_block$5(ctx) {
    	let ul;
    	let each_blocks = [];
    	let each_1_lookup = new Map();
    	let current;
    	let each_value = /*entries*/ ctx[1];
    	const get_key = ctx => /*key*/ ctx[7];

    	for (let i = 0; i < each_value.length; i += 1) {
    		let child_ctx = get_each_context$1(ctx, each_value, i);
    		let key = get_key(child_ctx);
    		each_1_lookup.set(key, each_blocks[i] = create_each_block$1(key, child_ctx));
    	}

    	return {
    		c() {
    			ul = element("ul");

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].c();
    			}

    			attr(ul, "class", "svelte-hrybu5");
    		},
    		m(target, anchor) {
    			insert(target, ul, anchor);

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].m(ul, null);
    			}

    			current = true;
    		},
    		p(ctx, dirty) {
    			if (dirty & /*errorMessages, entries, readOnly, change*/ 30) {
    				const each_value = /*entries*/ ctx[1];
    				group_outros();
    				each_blocks = update_keyed_each(each_blocks, dirty, get_key, 1, ctx, each_value, each_1_lookup, ul, outro_and_destroy_block, create_each_block$1, null, get_each_context$1);
    				check_outros();
    			}
    		},
    		i(local) {
    			if (current) return;

    			for (let i = 0; i < each_value.length; i += 1) {
    				transition_in(each_blocks[i]);
    			}

    			current = true;
    		},
    		o(local) {
    			for (let i = 0; i < each_blocks.length; i += 1) {
    				transition_out(each_blocks[i]);
    			}

    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(ul);

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].d();
    			}
    		}
    	};
    }

    // (43:52) {#each entries as { key, value }
    function create_each_block$1(key_1, ctx) {
    	let first;
    	let current;

    	function change_handler(...args) {
    		return /*change_handler*/ ctx[6](/*key*/ ctx[7], ...args);
    	}

    	const collapsablevalue = new CollapsableValue({
    			props: {
    				errorMessage: /*errorMessages*/ ctx[3][/*key*/ ctx[7]],
    				readOnly: /*readOnly*/ ctx[2],
    				key: /*key*/ ctx[7],
    				value: /*value*/ ctx[8]
    			}
    		});

    	collapsablevalue.$on("change", change_handler);

    	return {
    		key: key_1,
    		first: null,
    		c() {
    			first = empty();
    			create_component(collapsablevalue.$$.fragment);
    			this.first = first;
    		},
    		m(target, anchor) {
    			insert(target, first, anchor);
    			mount_component(collapsablevalue, target, anchor);
    			current = true;
    		},
    		p(new_ctx, dirty) {
    			ctx = new_ctx;
    			const collapsablevalue_changes = {};
    			if (dirty & /*errorMessages, entries*/ 10) collapsablevalue_changes.errorMessage = /*errorMessages*/ ctx[3][/*key*/ ctx[7]];
    			if (dirty & /*readOnly*/ 4) collapsablevalue_changes.readOnly = /*readOnly*/ ctx[2];
    			if (dirty & /*entries*/ 2) collapsablevalue_changes.key = /*key*/ ctx[7];
    			if (dirty & /*entries*/ 2) collapsablevalue_changes.value = /*value*/ ctx[8];
    			collapsablevalue.$set(collapsablevalue_changes);
    		},
    		i(local) {
    			if (current) return;
    			transition_in(collapsablevalue.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(collapsablevalue.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(first);
    			destroy_component(collapsablevalue, detaching);
    		}
    	};
    }

    function create_fragment$a(ctx) {
    	let h1;
    	let t;
    	let current_block_type_index;
    	let if_block;
    	let if_block_anchor;
    	let current;
    	const if_block_creators = [create_if_block$5, create_else_block$3];
    	const if_blocks = [];

    	function select_block_type(ctx, dirty) {
    		if (/*entries*/ ctx[1].length) return 0;
    		return 1;
    	}

    	current_block_type_index = select_block_type(ctx);
    	if_block = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);

    	return {
    		c() {
    			h1 = element("h1");
    			t = text(/*header*/ ctx[0]);
    			if_block.c();
    			if_block_anchor = empty();
    			attr(h1, "class", "svelte-hrybu5");
    		},
    		m(target, anchor) {
    			insert(target, h1, anchor);
    			append(h1, t);
    			if_blocks[current_block_type_index].m(target, anchor);
    			insert(target, if_block_anchor, anchor);
    			current = true;
    		},
    		p(ctx, [dirty]) {
    			if (!current || dirty & /*header*/ 1) set_data(t, /*header*/ ctx[0]);
    			let previous_block_index = current_block_type_index;
    			current_block_type_index = select_block_type(ctx);

    			if (current_block_type_index === previous_block_index) {
    				if_blocks[current_block_type_index].p(ctx, dirty);
    			} else {
    				group_outros();

    				transition_out(if_blocks[previous_block_index], 1, 1, () => {
    					if_blocks[previous_block_index] = null;
    				});

    				check_outros();
    				if_block = if_blocks[current_block_type_index];

    				if (!if_block) {
    					if_block = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);
    					if_block.c();
    				}

    				transition_in(if_block, 1);
    				if_block.m(if_block_anchor.parentNode, if_block_anchor);
    			}
    		},
    		i(local) {
    			if (current) return;
    			transition_in(if_block);
    			current = true;
    		},
    		o(local) {
    			transition_out(if_block);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(h1);
    			if_blocks[current_block_type_index].d(detaching);
    			if (detaching) detach(if_block_anchor);
    		}
    	};
    }

    function instance$a($$self, $$props, $$invalidate) {
    	let { header } = $$props;
    	let { entries = [] } = $$props;
    	let { id } = $$props;
    	let { readOnly = false } = $$props;
    	let errorMessages = {};

    	function change(key, value) {
    		chrome$1.devtools.inspectedWindow.eval(`__svelte_devtools_inject_state(${id}, '${key}', ${value})`, (result, error) => $$invalidate(
    			3,
    			errorMessages[key] = error && error.isException
    			? error.value.substring(0, error.value.indexOf("\n"))
    			: undefined,
    			errorMessages
    		));
    	}

    	const change_handler = (key, e) => change(key, e.detail);

    	$$self.$set = $$props => {
    		if ("header" in $$props) $$invalidate(0, header = $$props.header);
    		if ("entries" in $$props) $$invalidate(1, entries = $$props.entries);
    		if ("id" in $$props) $$invalidate(5, id = $$props.id);
    		if ("readOnly" in $$props) $$invalidate(2, readOnly = $$props.readOnly);
    	};

    	return [header, entries, readOnly, errorMessages, change, id, change_handler];
    }

    class PropertyList extends SvelteComponent {
    	constructor(options) {
    		super();

    		init(this, options, instance$a, create_fragment$a, safe_not_equal, {
    			header: 0,
    			entries: 1,
    			id: 5,
    			readOnly: 2
    		});
    	}
    }

    /* src/panel/ComponentView.svelte generated by Svelte v3.20.1 */

    function create_default_slot_2(ctx) {
    	let svg;
    	let path;

    	return {
    		c() {
    			svg = svg_element("svg");
    			path = svg_element("path");
    			attr(path, "d", "M4.5 4a.5.5 0 0 0-.5.5v7c0 .28.22.5.5.5h7a.5.5 0 0 0\n            .5-.5v-7a.5.5 0 0 0-.5-.5h-7zM2 4.5A2.5 2.5 0 0 1 4.5 2h7A2.5 2.5 0\n            0 1 14 4.5v7a2.5 2.5 0 0 1-2.5 2.5h-7A2.5 2.5 0 0 1 2 11.5v-7M.5\n            7.5a.5.5 0 0 0 0 1H2v-1H.5zM14 7.5h1.5a.5.5 0 0 1 0 1H14v-1zM8 0c.28\n            0 .5.22.5.5V2h-1V.5c0-.28.22-.5.5-.5zM8.5 14v1.5a.5.5 0 0 1-1\n            0V14h1z");
    			attr(svg, "xmlns", "http://www.w3.org/2000/svg");
    			attr(svg, "viewBox", "0 0 16 16");
    		},
    		m(target, anchor) {
    			insert(target, svg, anchor);
    			append(svg, path);
    		},
    		d(detaching) {
    			if (detaching) detach(svg);
    		}
    	};
    }

    // (28:36) <Toolbar>
    function create_default_slot_1$1(ctx) {
    	let div;
    	let current;

    	const button = new Button({
    			props: {
    				disabled: /*$selectedNode*/ ctx[0].id === undefined,
    				$$slots: { default: [create_default_slot_2] },
    				$$scope: { ctx }
    			}
    		});

    	button.$on("click", /*click_handler*/ ctx[1]);

    	return {
    		c() {
    			div = element("div");
    			create_component(button.$$.fragment);
    			attr(div, "class", "spacer svelte-kow66a");
    		},
    		m(target, anchor) {
    			insert(target, div, anchor);
    			mount_component(button, target, anchor);
    			current = true;
    		},
    		p(ctx, dirty) {
    			const button_changes = {};
    			if (dirty & /*$selectedNode*/ 1) button_changes.disabled = /*$selectedNode*/ ctx[0].id === undefined;

    			if (dirty & /*$$scope*/ 4) {
    				button_changes.$$scope = { dirty, ctx };
    			}

    			button.$set(button_changes);
    		},
    		i(local) {
    			if (current) return;
    			transition_in(button.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(button.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(div);
    			destroy_component(button, detaching);
    		}
    	};
    }

    // (46:87) 
    function create_if_block_2$1(ctx) {
    	let current;

    	const propertylist = new PropertyList({
    			props: {
    				readOnly: true,
    				id: /*$selectedNode*/ ctx[0].id,
    				header: "Attributes",
    				entries: /*$selectedNode*/ ctx[0].detail.attributes
    			}
    		});

    	return {
    		c() {
    			create_component(propertylist.$$.fragment);
    		},
    		m(target, anchor) {
    			mount_component(propertylist, target, anchor);
    			current = true;
    		},
    		p(ctx, dirty) {
    			const propertylist_changes = {};
    			if (dirty & /*$selectedNode*/ 1) propertylist_changes.id = /*$selectedNode*/ ctx[0].id;
    			if (dirty & /*$selectedNode*/ 1) propertylist_changes.entries = /*$selectedNode*/ ctx[0].detail.attributes;
    			propertylist.$set(propertylist_changes);
    		},
    		i(local) {
    			if (current) return;
    			transition_in(propertylist.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(propertylist.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			destroy_component(propertylist, detaching);
    		}
    	};
    }

    // (42:122) 
    function create_if_block_1$1(ctx) {
    	let current;

    	const propertylist = new PropertyList({
    			props: {
    				readOnly: true,
    				id: /*$selectedNode*/ ctx[0].id,
    				header: "State",
    				entries: /*$selectedNode*/ ctx[0].detail.ctx
    			}
    		});

    	return {
    		c() {
    			create_component(propertylist.$$.fragment);
    		},
    		m(target, anchor) {
    			mount_component(propertylist, target, anchor);
    			current = true;
    		},
    		p(ctx, dirty) {
    			const propertylist_changes = {};
    			if (dirty & /*$selectedNode*/ 1) propertylist_changes.id = /*$selectedNode*/ ctx[0].id;
    			if (dirty & /*$selectedNode*/ 1) propertylist_changes.entries = /*$selectedNode*/ ctx[0].detail.ctx;
    			propertylist.$set(propertylist_changes);
    		},
    		i(local) {
    			if (current) return;
    			transition_in(propertylist.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(propertylist.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			destroy_component(propertylist, detaching);
    		}
    	};
    }

    // (36:48) {#if $selectedNode.type == 'component'}
    function create_if_block$6(ctx) {
    	let current;

    	const propertylist0 = new PropertyList({
    			props: {
    				id: /*$selectedNode*/ ctx[0].id,
    				header: "Props",
    				entries: /*$selectedNode*/ ctx[0].detail.attributes
    			}
    		});

    	const propertylist1 = new PropertyList({
    			props: {
    				id: /*$selectedNode*/ ctx[0].id,
    				header: "State",
    				entries: /*$selectedNode*/ ctx[0].detail.ctx
    			}
    		});

    	return {
    		c() {
    			create_component(propertylist0.$$.fragment);
    			create_component(propertylist1.$$.fragment);
    		},
    		m(target, anchor) {
    			mount_component(propertylist0, target, anchor);
    			mount_component(propertylist1, target, anchor);
    			current = true;
    		},
    		p(ctx, dirty) {
    			const propertylist0_changes = {};
    			if (dirty & /*$selectedNode*/ 1) propertylist0_changes.id = /*$selectedNode*/ ctx[0].id;
    			if (dirty & /*$selectedNode*/ 1) propertylist0_changes.entries = /*$selectedNode*/ ctx[0].detail.attributes;
    			propertylist0.$set(propertylist0_changes);
    			const propertylist1_changes = {};
    			if (dirty & /*$selectedNode*/ 1) propertylist1_changes.id = /*$selectedNode*/ ctx[0].id;
    			if (dirty & /*$selectedNode*/ 1) propertylist1_changes.entries = /*$selectedNode*/ ctx[0].detail.ctx;
    			propertylist1.$set(propertylist1_changes);
    		},
    		i(local) {
    			if (current) return;
    			transition_in(propertylist0.$$.fragment, local);
    			transition_in(propertylist1.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(propertylist0.$$.fragment, local);
    			transition_out(propertylist1.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			destroy_component(propertylist0, detaching);
    			destroy_component(propertylist1, detaching);
    		}
    	};
    }

    // (28:11) <Panel>
    function create_default_slot$4(ctx) {
    	let div;
    	let current_block_type_index;
    	let if_block;
    	let current;

    	const toolbar = new Toolbar({
    			props: {
    				$$slots: { default: [create_default_slot_1$1] },
    				$$scope: { ctx }
    			}
    		});

    	const if_block_creators = [create_if_block$6, create_if_block_1$1, create_if_block_2$1];
    	const if_blocks = [];

    	function select_block_type(ctx, dirty) {
    		if (/*$selectedNode*/ ctx[0].type == "component") return 0;
    		if (/*$selectedNode*/ ctx[0].type == "block" || /*$selectedNode*/ ctx[0].type == "iteration") return 1;
    		if (/*$selectedNode*/ ctx[0].type == "element") return 2;
    		return -1;
    	}

    	if (~(current_block_type_index = select_block_type(ctx))) {
    		if_block = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);
    	}

    	return {
    		c() {
    			div = element("div");
    			create_component(toolbar.$$.fragment);
    			if (if_block) if_block.c();
    			attr(div, "class", "root svelte-kow66a");
    		},
    		m(target, anchor) {
    			insert(target, div, anchor);
    			mount_component(toolbar, div, null);

    			if (~current_block_type_index) {
    				if_blocks[current_block_type_index].m(div, null);
    			}

    			current = true;
    		},
    		p(ctx, dirty) {
    			const toolbar_changes = {};

    			if (dirty & /*$$scope, $selectedNode*/ 5) {
    				toolbar_changes.$$scope = { dirty, ctx };
    			}

    			toolbar.$set(toolbar_changes);
    			let previous_block_index = current_block_type_index;
    			current_block_type_index = select_block_type(ctx);

    			if (current_block_type_index === previous_block_index) {
    				if (~current_block_type_index) {
    					if_blocks[current_block_type_index].p(ctx, dirty);
    				}
    			} else {
    				if (if_block) {
    					group_outros();

    					transition_out(if_blocks[previous_block_index], 1, 1, () => {
    						if_blocks[previous_block_index] = null;
    					});

    					check_outros();
    				}

    				if (~current_block_type_index) {
    					if_block = if_blocks[current_block_type_index];

    					if (!if_block) {
    						if_block = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);
    						if_block.c();
    					}

    					transition_in(if_block, 1);
    					if_block.m(div, null);
    				} else {
    					if_block = null;
    				}
    			}
    		},
    		i(local) {
    			if (current) return;
    			transition_in(toolbar.$$.fragment, local);
    			transition_in(if_block);
    			current = true;
    		},
    		o(local) {
    			transition_out(toolbar.$$.fragment, local);
    			transition_out(if_block);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(div);
    			destroy_component(toolbar);

    			if (~current_block_type_index) {
    				if_blocks[current_block_type_index].d();
    			}
    		}
    	};
    }

    function create_fragment$b(ctx) {
    	let current;

    	const panel = new Panel({
    			props: {
    				$$slots: { default: [create_default_slot$4] },
    				$$scope: { ctx }
    			}
    		});

    	return {
    		c() {
    			create_component(panel.$$.fragment);
    		},
    		m(target, anchor) {
    			mount_component(panel, target, anchor);
    			current = true;
    		},
    		p(ctx, [dirty]) {
    			const panel_changes = {};

    			if (dirty & /*$$scope, $selectedNode*/ 5) {
    				panel_changes.$$scope = { dirty, ctx };
    			}

    			panel.$set(panel_changes);
    		},
    		i(local) {
    			if (current) return;
    			transition_in(panel.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(panel.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			destroy_component(panel, detaching);
    		}
    	};
    }

    function instance$b($$self, $$props, $$invalidate) {
    	let $selectedNode;
    	component_subscribe($$self, selectedNode, $$value => $$invalidate(0, $selectedNode = $$value));
    	const click_handler = e => chrome$1.devtools.inspectedWindow.eval("inspect(window.$s)");
    	return [$selectedNode, click_handler];
    }

    class ComponentView extends SvelteComponent {
    	constructor(options) {
    		super();
    		init(this, options, instance$b, create_fragment$b, safe_not_equal, {});
    	}
    }

    /* src/profiler/Operation.svelte generated by Svelte v3.20.1 */

    function create_fragment$c(ctx) {
    	let div;
    	let t0;
    	let span;
    	let t1_value = /*frame*/ ctx[0].node.tagName + "";
    	let t1;
    	let div_class_value;
    	let dispose;

    	return {
    		c() {
    			div = element("div");
    			t0 = text("‌");
    			span = element("span");
    			t1 = text(t1_value);
    			attr(div, "class", div_class_value = "" + (null_to_empty(/*frame*/ ctx[0].type) + " svelte-1povnv2"));
    		},
    		m(target, anchor, remount) {
    			insert(target, div, anchor);
    			append(div, t0);
    			append(div, span);
    			append(span, t1);
    			if (remount) dispose();
    			dispose = listen(div, "click", /*click_handler*/ ctx[2]);
    		},
    		p(ctx, [dirty]) {
    			if (dirty & /*frame*/ 1 && t1_value !== (t1_value = /*frame*/ ctx[0].node.tagName + "")) set_data(t1, t1_value);

    			if (dirty & /*frame*/ 1 && div_class_value !== (div_class_value = "" + (null_to_empty(/*frame*/ ctx[0].type) + " svelte-1povnv2"))) {
    				attr(div, "class", div_class_value);
    			}
    		},
    		i: noop,
    		o: noop,
    		d(detaching) {
    			if (detaching) detach(div);
    			dispose();
    		}
    	};
    }

    function instance$c($$self, $$props, $$invalidate) {
    	const dispatch = createEventDispatcher();
    	let { frame } = $$props;
    	const click_handler = () => dispatch("click", frame);

    	$$self.$set = $$props => {
    		if ("frame" in $$props) $$invalidate(0, frame = $$props.frame);
    	};

    	return [frame, dispatch, click_handler];
    }

    class Operation extends SvelteComponent {
    	constructor(options) {
    		super();
    		init(this, options, instance$c, create_fragment$c, safe_not_equal, { frame: 0 });
    	}
    }

    /* src/profiler/Frame.svelte generated by Svelte v3.20.1 */

    function get_each_context$2(ctx, list, i) {
    	const child_ctx = ctx.slice();
    	child_ctx[4] = list[i];
    	child_ctx[6] = i;
    	return child_ctx;
    }

    // (16:11) {#if children}
    function create_if_block$7(ctx) {
    	let ul;
    	let current;
    	let each_value = /*children*/ ctx[0];
    	let each_blocks = [];

    	for (let i = 0; i < each_value.length; i += 1) {
    		each_blocks[i] = create_each_block$2(get_each_context$2(ctx, each_value, i));
    	}

    	const out = i => transition_out(each_blocks[i], 1, 1, () => {
    		each_blocks[i] = null;
    	});

    	return {
    		c() {
    			ul = element("ul");

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].c();
    			}

    			attr(ul, "class", "svelte-10o7xn8");
    		},
    		m(target, anchor) {
    			insert(target, ul, anchor);

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].m(ul, null);
    			}

    			current = true;
    		},
    		p(ctx, dirty) {
    			if (dirty & /*children, duration*/ 3) {
    				each_value = /*children*/ ctx[0];
    				let i;

    				for (i = 0; i < each_value.length; i += 1) {
    					const child_ctx = get_each_context$2(ctx, each_value, i);

    					if (each_blocks[i]) {
    						each_blocks[i].p(child_ctx, dirty);
    						transition_in(each_blocks[i], 1);
    					} else {
    						each_blocks[i] = create_each_block$2(child_ctx);
    						each_blocks[i].c();
    						transition_in(each_blocks[i], 1);
    						each_blocks[i].m(ul, null);
    					}
    				}

    				group_outros();

    				for (i = each_value.length; i < each_blocks.length; i += 1) {
    					out(i);
    				}

    				check_outros();
    			}
    		},
    		i(local) {
    			if (current) return;

    			for (let i = 0; i < each_value.length; i += 1) {
    				transition_in(each_blocks[i]);
    			}

    			current = true;
    		},
    		o(local) {
    			each_blocks = each_blocks.filter(Boolean);

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				transition_out(each_blocks[i]);
    			}

    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(ul);
    			destroy_each(each_blocks, detaching);
    		}
    	};
    }

    // (16:29) {#each children as child, i}
    function create_each_block$2(ctx) {
    	let li;
    	let current;
    	const operation = new Operation({ props: { frame: /*child*/ ctx[4] } });
    	operation.$on("click", /*click_handler*/ ctx[2]);
    	const frame_spread_levels = [/*child*/ ctx[4]];
    	let frame_props = {};

    	for (let i = 0; i < frame_spread_levels.length; i += 1) {
    		frame_props = assign(frame_props, frame_spread_levels[i]);
    	}

    	const frame = new Frame({ props: frame_props });
    	frame.$on("click", /*click_handler_1*/ ctx[3]);

    	return {
    		c() {
    			li = element("li");
    			create_component(operation.$$.fragment);
    			create_component(frame.$$.fragment);
    			set_style(li, "width", /*child*/ ctx[4].duration / /*duration*/ ctx[1] * 100 + "%");
    			attr(li, "class", "svelte-10o7xn8");
    		},
    		m(target, anchor) {
    			insert(target, li, anchor);
    			mount_component(operation, li, null);
    			mount_component(frame, li, null);
    			current = true;
    		},
    		p(ctx, dirty) {
    			const operation_changes = {};
    			if (dirty & /*children*/ 1) operation_changes.frame = /*child*/ ctx[4];
    			operation.$set(operation_changes);

    			const frame_changes = (dirty & /*children*/ 1)
    			? get_spread_update(frame_spread_levels, [get_spread_object(/*child*/ ctx[4])])
    			: {};

    			frame.$set(frame_changes);

    			if (!current || dirty & /*children, duration*/ 3) {
    				set_style(li, "width", /*child*/ ctx[4].duration / /*duration*/ ctx[1] * 100 + "%");
    			}
    		},
    		i(local) {
    			if (current) return;
    			transition_in(operation.$$.fragment, local);
    			transition_in(frame.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(operation.$$.fragment, local);
    			transition_out(frame.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(li);
    			destroy_component(operation);
    			destroy_component(frame);
    		}
    	};
    }

    function create_fragment$d(ctx) {
    	let if_block_anchor;
    	let current;
    	let if_block = /*children*/ ctx[0] && create_if_block$7(ctx);

    	return {
    		c() {
    			if (if_block) if_block.c();
    			if_block_anchor = empty();
    		},
    		m(target, anchor) {
    			if (if_block) if_block.m(target, anchor);
    			insert(target, if_block_anchor, anchor);
    			current = true;
    		},
    		p(ctx, [dirty]) {
    			if (/*children*/ ctx[0]) {
    				if (if_block) {
    					if_block.p(ctx, dirty);
    					transition_in(if_block, 1);
    				} else {
    					if_block = create_if_block$7(ctx);
    					if_block.c();
    					transition_in(if_block, 1);
    					if_block.m(if_block_anchor.parentNode, if_block_anchor);
    				}
    			} else if (if_block) {
    				group_outros();

    				transition_out(if_block, 1, 1, () => {
    					if_block = null;
    				});

    				check_outros();
    			}
    		},
    		i(local) {
    			if (current) return;
    			transition_in(if_block);
    			current = true;
    		},
    		o(local) {
    			transition_out(if_block);
    			current = false;
    		},
    		d(detaching) {
    			if (if_block) if_block.d(detaching);
    			if (detaching) detach(if_block_anchor);
    		}
    	};
    }

    function instance$d($$self, $$props, $$invalidate) {
    	let { children } = $$props;
    	let { duration } = $$props;

    	function click_handler(event) {
    		bubble($$self, event);
    	}

    	function click_handler_1(event) {
    		bubble($$self, event);
    	}

    	$$self.$set = $$props => {
    		if ("children" in $$props) $$invalidate(0, children = $$props.children);
    		if ("duration" in $$props) $$invalidate(1, duration = $$props.duration);
    	};

    	return [children, duration, click_handler, click_handler_1];
    }

    class Frame extends SvelteComponent {
    	constructor(options) {
    		super();
    		init(this, options, instance$d, create_fragment$d, safe_not_equal, { children: 0, duration: 1 });
    	}
    }

    /* src/profiler/Profiler.svelte generated by Svelte v3.20.1 */

    function create_else_block_1$1(ctx) {
    	let current;
    	const profilebutton = new ProfileButton({});

    	return {
    		c() {
    			create_component(profilebutton.$$.fragment);
    		},
    		m(target, anchor) {
    			mount_component(profilebutton, target, anchor);
    			current = true;
    		},
    		p: noop,
    		i(local) {
    			if (current) return;
    			transition_in(profilebutton.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(profilebutton.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			destroy_component(profilebutton, detaching);
    		}
    	};
    }

    // (51:20) {#if top}
    function create_if_block_2$2(ctx) {
    	let current;

    	const button = new Button({
    			props: {
    				$$slots: { default: [create_default_slot_3] },
    				$$scope: { ctx }
    			}
    		});

    	button.$on("click", /*click_handler*/ ctx[6]);

    	return {
    		c() {
    			create_component(button.$$.fragment);
    		},
    		m(target, anchor) {
    			mount_component(button, target, anchor);
    			current = true;
    		},
    		p(ctx, dirty) {
    			const button_changes = {};

    			if (dirty & /*$$scope*/ 256) {
    				button_changes.$$scope = { dirty, ctx };
    			}

    			button.$set(button_changes);
    		},
    		i(local) {
    			if (current) return;
    			transition_in(button.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(button.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			destroy_component(button, detaching);
    		}
    	};
    }

    // (51:29) <Button on:click={() => (top = null)}>
    function create_default_slot_3(ctx) {
    	let svg;
    	let path;

    	return {
    		c() {
    			svg = svg_element("svg");
    			path = svg_element("path");
    			attr(path, "d", "M12.7,1.4 11.3,0l-8,8 8,8 1.4,-1.4L6,8Z");
    			attr(svg, "xmlns", "http://www.w3.org/2000/svg");
    			attr(svg, "viewBox", "0 0 16 16");
    		},
    		m(target, anchor) {
    			insert(target, svg, anchor);
    			append(svg, path);
    		},
    		d(detaching) {
    			if (detaching) detach(svg);
    		}
    	};
    }

    // (51:223) <Button     on:click={() => {       $profileFrame = {}       top = null       selected = null     }}>
    function create_default_slot_2$1(ctx) {
    	let svg;
    	let path;

    	return {
    		c() {
    			svg = svg_element("svg");
    			path = svg_element("path");
    			attr(path, "d", "m2.7,14.2 c 0,1 0.8,1.8 1.8,1.8h7c1,0 1.8,-0.8\n        1.8,-1.8V3.6H2.7ZM14.2,0.9H11L10.2,0H5.8L4.9,0.9H1.8V2.7h12.5z");
    			attr(svg, "xmlns", "http://www.w3.org/2000/svg");
    			attr(svg, "viewBox", "0 0 16 16");
    		},
    		m(target, anchor) {
    			insert(target, svg, anchor);
    			append(svg, path);
    		},
    		d(detaching) {
    			if (detaching) detach(svg);
    		}
    	};
    }

    // (51:11) <Toolbar>
    function create_default_slot_1$2(ctx) {
    	let current_block_type_index;
    	let if_block;
    	let if_block_anchor;
    	let current;
    	const if_block_creators = [create_if_block_2$2, create_else_block_1$1];
    	const if_blocks = [];

    	function select_block_type(ctx, dirty) {
    		if (/*top*/ ctx[1]) return 0;
    		return 1;
    	}

    	current_block_type_index = select_block_type(ctx);
    	if_block = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);

    	const button = new Button({
    			props: {
    				$$slots: { default: [create_default_slot_2$1] },
    				$$scope: { ctx }
    			}
    		});

    	button.$on("click", /*click_handler_1*/ ctx[7]);

    	return {
    		c() {
    			if_block.c();
    			if_block_anchor = empty();
    			create_component(button.$$.fragment);
    		},
    		m(target, anchor) {
    			if_blocks[current_block_type_index].m(target, anchor);
    			insert(target, if_block_anchor, anchor);
    			mount_component(button, target, anchor);
    			current = true;
    		},
    		p(ctx, dirty) {
    			let previous_block_index = current_block_type_index;
    			current_block_type_index = select_block_type(ctx);

    			if (current_block_type_index === previous_block_index) {
    				if_blocks[current_block_type_index].p(ctx, dirty);
    			} else {
    				group_outros();

    				transition_out(if_blocks[previous_block_index], 1, 1, () => {
    					if_blocks[previous_block_index] = null;
    				});

    				check_outros();
    				if_block = if_blocks[current_block_type_index];

    				if (!if_block) {
    					if_block = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);
    					if_block.c();
    				}

    				transition_in(if_block, 1);
    				if_block.m(if_block_anchor.parentNode, if_block_anchor);
    			}

    			const button_changes = {};

    			if (dirty & /*$$scope*/ 256) {
    				button_changes.$$scope = { dirty, ctx };
    			}

    			button.$set(button_changes);
    		},
    		i(local) {
    			if (current) return;
    			transition_in(if_block);
    			transition_in(button.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(if_block);
    			transition_out(button.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			if_blocks[current_block_type_index].d(detaching);
    			if (detaching) detach(if_block_anchor);
    			destroy_component(button, detaching);
    		}
    	};
    }

    // (58:193) {:else}
    function create_else_block$4(ctx) {
    	let p;

    	return {
    		c() {
    			p = element("p");
    			p.textContent = "Nothing to display. Perform an action or refresh the page.";
    			attr(p, "class", "svelte-1wqacti");
    		},
    		m(target, anchor) {
    			insert(target, p, anchor);
    		},
    		p: noop,
    		i: noop,
    		o: noop,
    		d(detaching) {
    			if (detaching) detach(p);
    		}
    	};
    }

    // (58:118) {#if children.length}
    function create_if_block_1$2(ctx) {
    	let current;

    	const frame = new Frame({
    			props: {
    				children: /*children*/ ctx[2],
    				duration: /*duration*/ ctx[4]
    			}
    		});

    	frame.$on("click", /*handleClick*/ ctx[5]);

    	return {
    		c() {
    			create_component(frame.$$.fragment);
    		},
    		m(target, anchor) {
    			mount_component(frame, target, anchor);
    			current = true;
    		},
    		p(ctx, dirty) {
    			const frame_changes = {};
    			if (dirty & /*children*/ 4) frame_changes.children = /*children*/ ctx[2];
    			if (dirty & /*duration*/ 16) frame_changes.duration = /*duration*/ ctx[4];
    			frame.$set(frame_changes);
    		},
    		i(local) {
    			if (current) return;
    			transition_in(frame.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(frame.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			destroy_component(frame, detaching);
    		}
    	};
    }

    // (58:276) {#if selected}
    function create_if_block$8(ctx) {
    	let current;

    	const panel = new Panel({
    			props: {
    				grow: "up",
    				$$slots: { default: [create_default_slot$5] },
    				$$scope: { ctx }
    			}
    		});

    	return {
    		c() {
    			create_component(panel.$$.fragment);
    		},
    		m(target, anchor) {
    			mount_component(panel, target, anchor);
    			current = true;
    		},
    		p(ctx, dirty) {
    			const panel_changes = {};

    			if (dirty & /*$$scope, selected*/ 257) {
    				panel_changes.$$scope = { dirty, ctx };
    			}

    			panel.$set(panel_changes);
    		},
    		i(local) {
    			if (current) return;
    			transition_in(panel.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(panel.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			destroy_component(panel, detaching);
    		}
    	};
    }

    // (58:290) <Panel grow="up">
    function create_default_slot$5(ctx) {
    	let div6;
    	let div0;
    	let span0;
    	let t1_value = /*selected*/ ctx[0].node.tagName + "";
    	let t1;
    	let t2;
    	let t3_value = /*selected*/ ctx[0].node.id + "";
    	let t3;
    	let t4;
    	let div1;
    	let span1;
    	let t6_value = round(/*selected*/ ctx[0].start) + "";
    	let t6;
    	let t7;
    	let div2;
    	let span2;
    	let t9_value = /*selected*/ ctx[0].type + "";
    	let t9;
    	let div3;
    	let span3;
    	let t11_value = /*selected*/ ctx[0].node.type + "";
    	let t11;
    	let div4;
    	let span4;
    	let t13_value = round(/*selected*/ ctx[0].end) + "";
    	let t13;
    	let t14;
    	let div5;
    	let span5;
    	let t16_value = round(/*selected*/ ctx[0].children.reduce(func, /*selected*/ ctx[0].duration)) + "";
    	let t16;
    	let t17;
    	let t18_value = round(/*selected*/ ctx[0].duration) + "";
    	let t18;
    	let t19;

    	return {
    		c() {
    			div6 = element("div");
    			div0 = element("div");
    			span0 = element("span");
    			span0.textContent = "Tag name";
    			t1 = text(t1_value);
    			t2 = text(" (#");
    			t3 = text(t3_value);
    			t4 = text(")");
    			div1 = element("div");
    			span1 = element("span");
    			span1.textContent = "Start";
    			t6 = text(t6_value);
    			t7 = text("ms");
    			div2 = element("div");
    			span2 = element("span");
    			span2.textContent = "Operation";
    			t9 = text(t9_value);
    			div3 = element("div");
    			span3 = element("span");
    			span3.textContent = "Block type";
    			t11 = text(t11_value);
    			div4 = element("div");
    			span4 = element("span");
    			span4.textContent = "End";
    			t13 = text(t13_value);
    			t14 = text("ms");
    			div5 = element("div");
    			span5 = element("span");
    			span5.textContent = "Duration";
    			t16 = text(t16_value);
    			t17 = text("ms\n        of ");
    			t18 = text(t18_value);
    			t19 = text("ms");
    			attr(span0, "class", "svelte-1wqacti");
    			attr(div0, "class", "svelte-1wqacti");
    			attr(span1, "class", "svelte-1wqacti");
    			attr(div1, "class", "svelte-1wqacti");
    			attr(span2, "class", "svelte-1wqacti");
    			attr(div2, "class", "svelte-1wqacti");
    			attr(span3, "class", "svelte-1wqacti");
    			attr(div3, "class", "svelte-1wqacti");
    			attr(span4, "class", "svelte-1wqacti");
    			attr(div4, "class", "svelte-1wqacti");
    			attr(span5, "class", "svelte-1wqacti");
    			attr(div5, "class", "svelte-1wqacti");
    			attr(div6, "class", "panel svelte-1wqacti");
    		},
    		m(target, anchor) {
    			insert(target, div6, anchor);
    			append(div6, div0);
    			append(div0, span0);
    			append(div0, t1);
    			append(div0, t2);
    			append(div0, t3);
    			append(div0, t4);
    			append(div6, div1);
    			append(div1, span1);
    			append(div1, t6);
    			append(div1, t7);
    			append(div6, div2);
    			append(div2, span2);
    			append(div2, t9);
    			append(div6, div3);
    			append(div3, span3);
    			append(div3, t11);
    			append(div6, div4);
    			append(div4, span4);
    			append(div4, t13);
    			append(div4, t14);
    			append(div6, div5);
    			append(div5, span5);
    			append(div5, t16);
    			append(div5, t17);
    			append(div5, t18);
    			append(div5, t19);
    		},
    		p(ctx, dirty) {
    			if (dirty & /*selected*/ 1 && t1_value !== (t1_value = /*selected*/ ctx[0].node.tagName + "")) set_data(t1, t1_value);
    			if (dirty & /*selected*/ 1 && t3_value !== (t3_value = /*selected*/ ctx[0].node.id + "")) set_data(t3, t3_value);
    			if (dirty & /*selected*/ 1 && t6_value !== (t6_value = round(/*selected*/ ctx[0].start) + "")) set_data(t6, t6_value);
    			if (dirty & /*selected*/ 1 && t9_value !== (t9_value = /*selected*/ ctx[0].type + "")) set_data(t9, t9_value);
    			if (dirty & /*selected*/ 1 && t11_value !== (t11_value = /*selected*/ ctx[0].node.type + "")) set_data(t11, t11_value);
    			if (dirty & /*selected*/ 1 && t13_value !== (t13_value = round(/*selected*/ ctx[0].end) + "")) set_data(t13, t13_value);
    			if (dirty & /*selected*/ 1 && t16_value !== (t16_value = round(/*selected*/ ctx[0].children.reduce(func, /*selected*/ ctx[0].duration)) + "")) set_data(t16, t16_value);
    			if (dirty & /*selected*/ 1 && t18_value !== (t18_value = round(/*selected*/ ctx[0].duration) + "")) set_data(t18, t18_value);
    		},
    		d(detaching) {
    			if (detaching) detach(div6);
    		}
    	};
    }

    function create_fragment$e(ctx) {
    	let div;
    	let current_block_type_index;
    	let if_block0;
    	let if_block1_anchor;
    	let current;

    	const toolbar = new Toolbar({
    			props: {
    				$$slots: { default: [create_default_slot_1$2] },
    				$$scope: { ctx }
    			}
    		});

    	const if_block_creators = [create_if_block_1$2, create_else_block$4];
    	const if_blocks = [];

    	function select_block_type_1(ctx, dirty) {
    		if (/*children*/ ctx[2].length) return 0;
    		return 1;
    	}

    	current_block_type_index = select_block_type_1(ctx);
    	if_block0 = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);
    	let if_block1 = /*selected*/ ctx[0] && create_if_block$8(ctx);

    	return {
    		c() {
    			create_component(toolbar.$$.fragment);
    			div = element("div");
    			if_block0.c();
    			if (if_block1) if_block1.c();
    			if_block1_anchor = empty();
    			attr(div, "class", "frame svelte-1wqacti");
    		},
    		m(target, anchor) {
    			mount_component(toolbar, target, anchor);
    			insert(target, div, anchor);
    			if_blocks[current_block_type_index].m(div, null);
    			if (if_block1) if_block1.m(target, anchor);
    			insert(target, if_block1_anchor, anchor);
    			current = true;
    		},
    		p(ctx, [dirty]) {
    			const toolbar_changes = {};

    			if (dirty & /*$$scope, $profileFrame, top, selected*/ 267) {
    				toolbar_changes.$$scope = { dirty, ctx };
    			}

    			toolbar.$set(toolbar_changes);
    			let previous_block_index = current_block_type_index;
    			current_block_type_index = select_block_type_1(ctx);

    			if (current_block_type_index === previous_block_index) {
    				if_blocks[current_block_type_index].p(ctx, dirty);
    			} else {
    				group_outros();

    				transition_out(if_blocks[previous_block_index], 1, 1, () => {
    					if_blocks[previous_block_index] = null;
    				});

    				check_outros();
    				if_block0 = if_blocks[current_block_type_index];

    				if (!if_block0) {
    					if_block0 = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);
    					if_block0.c();
    				}

    				transition_in(if_block0, 1);
    				if_block0.m(div, null);
    			}

    			if (/*selected*/ ctx[0]) {
    				if (if_block1) {
    					if_block1.p(ctx, dirty);
    					transition_in(if_block1, 1);
    				} else {
    					if_block1 = create_if_block$8(ctx);
    					if_block1.c();
    					transition_in(if_block1, 1);
    					if_block1.m(if_block1_anchor.parentNode, if_block1_anchor);
    				}
    			} else if (if_block1) {
    				group_outros();

    				transition_out(if_block1, 1, 1, () => {
    					if_block1 = null;
    				});

    				check_outros();
    			}
    		},
    		i(local) {
    			if (current) return;
    			transition_in(toolbar.$$.fragment, local);
    			transition_in(if_block0);
    			transition_in(if_block1);
    			current = true;
    		},
    		o(local) {
    			transition_out(toolbar.$$.fragment, local);
    			transition_out(if_block0);
    			transition_out(if_block1);
    			current = false;
    		},
    		d(detaching) {
    			destroy_component(toolbar, detaching);
    			if (detaching) detach(div);
    			if_blocks[current_block_type_index].d();
    			if (if_block1) if_block1.d(detaching);
    			if (detaching) detach(if_block1_anchor);
    		}
    	};
    }

    function round(n) {
    	return Math.round(n * 100) / 100;
    }

    const func = (acc, o) => acc - o.duration;

    function instance$e($$self, $$props, $$invalidate) {
    	let $profileFrame;
    	component_subscribe($$self, profileFrame, $$value => $$invalidate(3, $profileFrame = $$value));
    	let selected;
    	let top;

    	function handleClick(e) {
    		if (selected == e.detail) $$invalidate(1, top = e.detail); else $$invalidate(0, selected = e.detail);
    	}

    	const click_handler = () => $$invalidate(1, top = null);

    	const click_handler_1 = () => {
    		set_store_value(profileFrame, $profileFrame = {});
    		$$invalidate(1, top = null);
    		$$invalidate(0, selected = null);
    	};

    	let children;
    	let duration;

    	$$self.$$.update = () => {
    		if ($$self.$$.dirty & /*top, $profileFrame*/ 10) {
    			 $$invalidate(2, children = top ? [top] : $profileFrame.children || []);
    		}

    		if ($$self.$$.dirty & /*children*/ 4) {
    			 $$invalidate(4, duration = children.reduce((acc, o) => acc + o.duration, 0));
    		}
    	};

    	return [
    		selected,
    		top,
    		children,
    		$profileFrame,
    		duration,
    		handleClick,
    		click_handler,
    		click_handler_1
    	];
    }

    class Profiler extends SvelteComponent {
    	constructor(options) {
    		super();
    		init(this, options, instance$e, create_fragment$e, safe_not_equal, {});
    	}
    }

    /* src/Breadcrumbs.svelte generated by Svelte v3.20.1 */

    function get_each_context$3(ctx, list, i) {
    	const child_ctx = ctx.slice();
    	child_ctx[10] = list[i];
    	return child_ctx;
    }

    // (92:11) {#if breadcrumbList.length > 1}
    function create_if_block$9(ctx) {
    	let ul;
    	let if_block_anchor;
    	let if_block = /*shorttend*/ ctx[2] && create_if_block_2$3();
    	let each_value = /*breadcrumbList*/ ctx[1];
    	let each_blocks = [];

    	for (let i = 0; i < each_value.length; i += 1) {
    		each_blocks[i] = create_each_block$3(get_each_context$3(ctx, each_value, i));
    	}

    	return {
    		c() {
    			ul = element("ul");
    			if (if_block) if_block.c();
    			if_block_anchor = empty();

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].c();
    			}

    			attr(ul, "class", "svelte-rdc0gc");
    		},
    		m(target, anchor) {
    			insert(target, ul, anchor);
    			if (if_block) if_block.m(ul, null);
    			append(ul, if_block_anchor);

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].m(ul, null);
    			}

    			/*ul_binding*/ ctx[9](ul);
    		},
    		p(ctx, dirty) {
    			if (/*shorttend*/ ctx[2]) {
    				if (!if_block) {
    					if_block = create_if_block_2$3();
    					if_block.c();
    					if_block.m(ul, if_block_anchor);
    				}
    			} else if (if_block) {
    				if_block.d(1);
    				if_block = null;
    			}

    			if (dirty & /*breadcrumbList, $selectedNode, $hoveredNodeId, $visibility*/ 58) {
    				each_value = /*breadcrumbList*/ ctx[1];
    				let i;

    				for (i = 0; i < each_value.length; i += 1) {
    					const child_ctx = get_each_context$3(ctx, each_value, i);

    					if (each_blocks[i]) {
    						each_blocks[i].p(child_ctx, dirty);
    					} else {
    						each_blocks[i] = create_each_block$3(child_ctx);
    						each_blocks[i].c();
    						each_blocks[i].m(ul, null);
    					}
    				}

    				for (; i < each_blocks.length; i += 1) {
    					each_blocks[i].d(1);
    				}

    				each_blocks.length = each_value.length;
    			}
    		},
    		d(detaching) {
    			if (detaching) detach(ul);
    			if (if_block) if_block.d();
    			destroy_each(each_blocks, detaching);
    			/*ul_binding*/ ctx[9](null);
    		}
    	};
    }

    // (92:63) {#if shorttend}
    function create_if_block_2$3(ctx) {
    	let li;

    	return {
    		c() {
    			li = element("li");
    			li.innerHTML = `…<div class="svelte-rdc0gc"></div>`;
    			attr(li, "class", "svelte-rdc0gc");
    		},
    		m(target, anchor) {
    			insert(target, li, anchor);
    		},
    		d(detaching) {
    			if (detaching) detach(li);
    		}
    	};
    }

    // (92:137) {#if $visibility[node.type]}
    function create_if_block_1$3(ctx) {
    	let li;
    	let t_value = /*node*/ ctx[10].tagName + "";
    	let t;
    	let div;
    	let dispose;

    	function click_handler(...args) {
    		return /*click_handler*/ ctx[7](/*node*/ ctx[10], ...args);
    	}

    	function mouseover_handler(...args) {
    		return /*mouseover_handler*/ ctx[8](/*node*/ ctx[10], ...args);
    	}

    	return {
    		c() {
    			li = element("li");
    			t = text(t_value);
    			div = element("div");
    			attr(div, "class", "svelte-rdc0gc");
    			attr(li, "class", "svelte-rdc0gc");
    			toggle_class(li, "selected", /*node*/ ctx[10].id == /*$selectedNode*/ ctx[3].id);
    		},
    		m(target, anchor, remount) {
    			insert(target, li, anchor);
    			append(li, t);
    			append(li, div);
    			if (remount) run_all(dispose);

    			dispose = [
    				listen(li, "click", click_handler),
    				listen(li, "mouseover", mouseover_handler)
    			];
    		},
    		p(new_ctx, dirty) {
    			ctx = new_ctx;
    			if (dirty & /*breadcrumbList*/ 2 && t_value !== (t_value = /*node*/ ctx[10].tagName + "")) set_data(t, t_value);

    			if (dirty & /*breadcrumbList, $selectedNode*/ 10) {
    				toggle_class(li, "selected", /*node*/ ctx[10].id == /*$selectedNode*/ ctx[3].id);
    			}
    		},
    		d(detaching) {
    			if (detaching) detach(li);
    			run_all(dispose);
    		}
    	};
    }

    // (92:107) {#each breadcrumbList as node}
    function create_each_block$3(ctx) {
    	let if_block_anchor;
    	let if_block = /*$visibility*/ ctx[4][/*node*/ ctx[10].type] && create_if_block_1$3(ctx);

    	return {
    		c() {
    			if (if_block) if_block.c();
    			if_block_anchor = empty();
    		},
    		m(target, anchor) {
    			if (if_block) if_block.m(target, anchor);
    			insert(target, if_block_anchor, anchor);
    		},
    		p(ctx, dirty) {
    			if (/*$visibility*/ ctx[4][/*node*/ ctx[10].type]) {
    				if (if_block) {
    					if_block.p(ctx, dirty);
    				} else {
    					if_block = create_if_block_1$3(ctx);
    					if_block.c();
    					if_block.m(if_block_anchor.parentNode, if_block_anchor);
    				}
    			} else if (if_block) {
    				if_block.d(1);
    				if_block = null;
    			}
    		},
    		d(detaching) {
    			if (if_block) if_block.d(detaching);
    			if (detaching) detach(if_block_anchor);
    		}
    	};
    }

    function create_fragment$f(ctx) {
    	let if_block_anchor;
    	let if_block = /*breadcrumbList*/ ctx[1].length > 1 && create_if_block$9(ctx);

    	return {
    		c() {
    			if (if_block) if_block.c();
    			if_block_anchor = empty();
    		},
    		m(target, anchor) {
    			if (if_block) if_block.m(target, anchor);
    			insert(target, if_block_anchor, anchor);
    		},
    		p(ctx, [dirty]) {
    			if (/*breadcrumbList*/ ctx[1].length > 1) {
    				if (if_block) {
    					if_block.p(ctx, dirty);
    				} else {
    					if_block = create_if_block$9(ctx);
    					if_block.c();
    					if_block.m(if_block_anchor.parentNode, if_block_anchor);
    				}
    			} else if (if_block) {
    				if_block.d(1);
    				if_block = null;
    			}
    		},
    		i: noop,
    		o: noop,
    		d(detaching) {
    			if (if_block) if_block.d(detaching);
    			if (detaching) detach(if_block_anchor);
    		}
    	};
    }

    function instance$f($$self, $$props, $$invalidate) {
    	let $selectedNode;
    	let $visibility;
    	let $hoveredNodeId;
    	component_subscribe($$self, selectedNode, $$value => $$invalidate(3, $selectedNode = $$value));
    	component_subscribe($$self, visibility, $$value => $$invalidate(4, $visibility = $$value));
    	component_subscribe($$self, hoveredNodeId, $$value => $$invalidate(5, $hoveredNodeId = $$value));
    	let root;
    	let breadcrumbList = [];
    	let shorttend;

    	async function setSelectedBreadcrumb(node) {
    		if (breadcrumbList.find(o => o.id == node.id)) return;
    		$$invalidate(1, breadcrumbList = []);

    		while (node && node.tagName) {
    			breadcrumbList.unshift(node);
    			node = node.parent;
    		}

    		$$invalidate(2, shorttend = false);
    		await tick();

    		while (root && root.scrollWidth > root.clientWidth) {
    			breadcrumbList.shift();
    			$$invalidate(2, shorttend = true);
    			$$invalidate(1, breadcrumbList);
    			await tick();
    		}
    	}

    	const click_handler = (node, e) => set_store_value(selectedNode, $selectedNode = node);
    	const mouseover_handler = (node, e) => set_store_value(hoveredNodeId, $hoveredNodeId = node.id);

    	function ul_binding($$value) {
    		binding_callbacks[$$value ? "unshift" : "push"](() => {
    			$$invalidate(0, root = $$value);
    		});
    	}

    	$$self.$$.update = () => {
    		if ($$self.$$.dirty & /*$selectedNode*/ 8) {
    			 setSelectedBreadcrumb($selectedNode);
    		}
    	};

    	return [
    		root,
    		breadcrumbList,
    		shorttend,
    		$selectedNode,
    		$visibility,
    		$hoveredNodeId,
    		setSelectedBreadcrumb,
    		click_handler,
    		mouseover_handler,
    		ul_binding
    	];
    }

    class Breadcrumbs extends SvelteComponent {
    	constructor(options) {
    		super();
    		init(this, options, instance$f, create_fragment$f, safe_not_equal, {});
    	}
    }

    /* src/ConnectMessage.svelte generated by Svelte v3.20.1 */

    function create_fragment$g(ctx) {
    	let div;
    	let p;
    	let t0;
    	let b;
    	let t2;
    	let span;
    	let t4;
    	let h1;
    	let ul;
    	let dispose;

    	return {
    		c() {
    			div = element("div");
    			p = element("p");
    			t0 = text("To connect to ");
    			b = element("b");
    			b.textContent = "Svelte";
    			t2 = text(" perform a hard refresh (ctrl+F5) or ");
    			span = element("span");
    			span.textContent = "click here";
    			t4 = text(".");
    			h1 = element("h1");
    			h1.textContent = "Not working? Did you...";
    			ul = element("ul");
    			ul.innerHTML = `<li class="svelte-1bkld82">Use Svelte version 3.12.0 or above?</li><li class="svelte-1bkld82">Build with dev mode enabled?</li>`;
    			attr(span, "class", "button svelte-1bkld82");
    			attr(h1, "class", "svelte-1bkld82");
    			attr(ul, "class", "svelte-1bkld82");
    			attr(div, "class", "root svelte-1bkld82");
    		},
    		m(target, anchor, remount) {
    			insert(target, div, anchor);
    			append(div, p);
    			append(p, t0);
    			append(p, b);
    			append(p, t2);
    			append(p, span);
    			append(p, t4);
    			append(div, h1);
    			append(div, ul);
    			if (remount) dispose();
    			dispose = listen(span, "click", reload);
    		},
    		p: noop,
    		i: noop,
    		o: noop,
    		d(detaching) {
    			if (detaching) detach(div);
    			dispose();
    		}
    	};
    }

    class ConnectMessage extends SvelteComponent {
    	constructor(options) {
    		super();
    		init(this, options, null, create_fragment$g, safe_not_equal, {});
    	}
    }

    /* src/nodes/SearchTerm.svelte generated by Svelte v3.20.1 */

    function create_else_block$5(ctx) {
    	let t0;
    	let span;
    	let t1;
    	let t2;

    	return {
    		c() {
    			t0 = text(/*pre*/ ctx[3]);
    			span = element("span");
    			t1 = text(/*highlight*/ ctx[4]);
    			t2 = text(/*post*/ ctx[5]);
    			attr(span, "class", "svelte-q8dzkt");
    		},
    		m(target, anchor) {
    			insert(target, t0, anchor);
    			insert(target, span, anchor);
    			append(span, t1);
    			insert(target, t2, anchor);
    		},
    		p(ctx, dirty) {
    			if (dirty & /*pre*/ 8) set_data(t0, /*pre*/ ctx[3]);
    			if (dirty & /*highlight*/ 16) set_data(t1, /*highlight*/ ctx[4]);
    			if (dirty & /*post*/ 32) set_data(t2, /*post*/ ctx[5]);
    		},
    		d(detaching) {
    			if (detaching) detach(t0);
    			if (detaching) detach(span);
    			if (detaching) detach(t2);
    		}
    	};
    }

    // (16:11) {#if i == -1 || $searchValue.length < 2}
    function create_if_block$a(ctx) {
    	let t;

    	return {
    		c() {
    			t = text(/*text*/ ctx[0]);
    		},
    		m(target, anchor) {
    			insert(target, t, anchor);
    		},
    		p(ctx, dirty) {
    			if (dirty & /*text*/ 1) set_data(t, /*text*/ ctx[0]);
    		},
    		d(detaching) {
    			if (detaching) detach(t);
    		}
    	};
    }

    function create_fragment$h(ctx) {
    	let if_block_anchor;

    	function select_block_type(ctx, dirty) {
    		if (/*i*/ ctx[1] == -1 || /*$searchValue*/ ctx[2].length < 2) return create_if_block$a;
    		return create_else_block$5;
    	}

    	let current_block_type = select_block_type(ctx);
    	let if_block = current_block_type(ctx);

    	return {
    		c() {
    			if_block.c();
    			if_block_anchor = empty();
    		},
    		m(target, anchor) {
    			if_block.m(target, anchor);
    			insert(target, if_block_anchor, anchor);
    		},
    		p(ctx, [dirty]) {
    			if (current_block_type === (current_block_type = select_block_type(ctx)) && if_block) {
    				if_block.p(ctx, dirty);
    			} else {
    				if_block.d(1);
    				if_block = current_block_type(ctx);

    				if (if_block) {
    					if_block.c();
    					if_block.m(if_block_anchor.parentNode, if_block_anchor);
    				}
    			}
    		},
    		i: noop,
    		o: noop,
    		d(detaching) {
    			if_block.d(detaching);
    			if (detaching) detach(if_block_anchor);
    		}
    	};
    }

    function instance$g($$self, $$props, $$invalidate) {
    	let $searchValue;
    	component_subscribe($$self, searchValue, $$value => $$invalidate(2, $searchValue = $$value));
    	let { text } = $$props;

    	$$self.$set = $$props => {
    		if ("text" in $$props) $$invalidate(0, text = $$props.text);
    	};

    	let i;
    	let pre;
    	let highlight;
    	let post;

    	$$self.$$.update = () => {
    		if ($$self.$$.dirty & /*text, $searchValue*/ 5) {
    			 $$invalidate(1, i = text ? text.indexOf($searchValue) : -1);
    		}

    		if ($$self.$$.dirty & /*text, i*/ 3) {
    			 $$invalidate(3, pre = text ? text.substring(0, i) : "");
    		}

    		if ($$self.$$.dirty & /*text, i, $searchValue*/ 7) {
    			 $$invalidate(4, highlight = text ? text.substring(i, i + $searchValue.length) : "");
    		}

    		if ($$self.$$.dirty & /*text, i, $searchValue*/ 7) {
    			 $$invalidate(5, post = text ? text.substring(i + $searchValue.length) : "");
    		}
    	};

    	return [text, i, $searchValue, pre, highlight, post];
    }

    class SearchTerm extends SvelteComponent {
    	constructor(options) {
    		super();
    		init(this, options, instance$g, create_fragment$h, safe_not_equal, { text: 0 });
    	}
    }

    /* src/nodes/ElementAttributes.svelte generated by Svelte v3.20.1 */

    function get_each_context$4(ctx, list, i) {
    	const child_ctx = ctx.slice();
    	child_ctx[2] = list[i].event;
    	child_ctx[3] = list[i].handler;
    	child_ctx[4] = list[i].modifiers;
    	return child_ctx;
    }

    function get_each_context_1$1(ctx, list, i) {
    	const child_ctx = ctx.slice();
    	child_ctx[7] = list[i].key;
    	child_ctx[8] = list[i].value;
    	child_ctx[9] = list[i].isBound;
    	child_ctx[10] = list[i].flash;
    	return child_ctx;
    }

    // (30:117) {#if isBound}
    function create_if_block_1$4(ctx) {
    	let t;

    	return {
    		c() {
    			t = text("bind:");
    		},
    		m(target, anchor) {
    			insert(target, t, anchor);
    		},
    		d(detaching) {
    			if (detaching) detach(t);
    		}
    	};
    }

    // (30:11) {#each attributes as { key, value, isBound, flash }
    function create_each_block_1$1(key_1, ctx) {
    	let t0;
    	let span2;
    	let span0;
    	let if_block_anchor;
    	let t1;
    	let span1;
    	let current;
    	let if_block = /*isBound*/ ctx[9] && create_if_block_1$4();
    	const searchterm0 = new SearchTerm({ props: { text: /*key*/ ctx[7] } });
    	const searchterm1 = new SearchTerm({ props: { text: /*value*/ ctx[8] } });

    	return {
    		key: key_1,
    		first: null,
    		c() {
    			t0 = text(" ");
    			span2 = element("span");
    			span0 = element("span");
    			if (if_block) if_block.c();
    			if_block_anchor = empty();
    			create_component(searchterm0.$$.fragment);
    			t1 = text("=");
    			span1 = element("span");
    			create_component(searchterm1.$$.fragment);
    			attr(span0, "class", "attr-name svelte-im928a");
    			attr(span1, "class", "attr-value svelte-im928a");
    			toggle_class(span2, "flash", /*flash*/ ctx[10]);
    			this.first = t0;
    		},
    		m(target, anchor) {
    			insert(target, t0, anchor);
    			insert(target, span2, anchor);
    			append(span2, span0);
    			if (if_block) if_block.m(span0, null);
    			append(span0, if_block_anchor);
    			mount_component(searchterm0, span0, null);
    			append(span2, t1);
    			append(span2, span1);
    			mount_component(searchterm1, span1, null);
    			current = true;
    		},
    		p(ctx, dirty) {
    			if (/*isBound*/ ctx[9]) {
    				if (!if_block) {
    					if_block = create_if_block_1$4();
    					if_block.c();
    					if_block.m(span0, if_block_anchor);
    				}
    			} else if (if_block) {
    				if_block.d(1);
    				if_block = null;
    			}

    			const searchterm0_changes = {};
    			if (dirty & /*attributes*/ 1) searchterm0_changes.text = /*key*/ ctx[7];
    			searchterm0.$set(searchterm0_changes);
    			const searchterm1_changes = {};
    			if (dirty & /*attributes*/ 1) searchterm1_changes.text = /*value*/ ctx[8];
    			searchterm1.$set(searchterm1_changes);

    			if (dirty & /*attributes*/ 1) {
    				toggle_class(span2, "flash", /*flash*/ ctx[10]);
    			}
    		},
    		i(local) {
    			if (current) return;
    			transition_in(searchterm0.$$.fragment, local);
    			transition_in(searchterm1.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(searchterm0.$$.fragment, local);
    			transition_out(searchterm1.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(t0);
    			if (detaching) detach(span2);
    			if (if_block) if_block.d();
    			destroy_component(searchterm0);
    			destroy_component(searchterm1);
    		}
    	};
    }

    // (32:100) {#if modifiers && modifiers.length}
    function create_if_block$b(ctx) {
    	let t0;
    	let t1_value = /*modifiers*/ ctx[4].join("|") + "";
    	let t1;

    	return {
    		c() {
    			t0 = text("|");
    			t1 = text(t1_value);
    		},
    		m(target, anchor) {
    			insert(target, t0, anchor);
    			insert(target, t1, anchor);
    		},
    		p(ctx, dirty) {
    			if (dirty & /*listeners*/ 2 && t1_value !== (t1_value = /*modifiers*/ ctx[4].join("|") + "")) set_data(t1, t1_value);
    		},
    		d(detaching) {
    			if (detaching) detach(t0);
    			if (detaching) detach(t1);
    		}
    	};
    }

    // (30:246) {#each listeners as { event, handler, modifiers }}
    function create_each_block$4(ctx) {
    	let t0;
    	let span;
    	let t1;
    	let span_data_tooltip_value;
    	let current;
    	const searchterm = new SearchTerm({ props: { text: /*event*/ ctx[2] } });
    	let if_block = /*modifiers*/ ctx[4] && /*modifiers*/ ctx[4].length && create_if_block$b(ctx);

    	return {
    		c() {
    			t0 = text(" ");
    			span = element("span");
    			t1 = text("on:");
    			create_component(searchterm.$$.fragment);
    			if (if_block) if_block.c();
    			attr(span, "class", "attr-name svelte-im928a");

    			attr(span, "data-tooltip", span_data_tooltip_value = typeof /*handler*/ ctx[3] == "function"
    			? /*handler*/ ctx[3]()
    			: /*handler*/ ctx[3]);
    		},
    		m(target, anchor) {
    			insert(target, t0, anchor);
    			insert(target, span, anchor);
    			append(span, t1);
    			mount_component(searchterm, span, null);
    			if (if_block) if_block.m(span, null);
    			current = true;
    		},
    		p(ctx, dirty) {
    			const searchterm_changes = {};
    			if (dirty & /*listeners*/ 2) searchterm_changes.text = /*event*/ ctx[2];
    			searchterm.$set(searchterm_changes);

    			if (/*modifiers*/ ctx[4] && /*modifiers*/ ctx[4].length) {
    				if (if_block) {
    					if_block.p(ctx, dirty);
    				} else {
    					if_block = create_if_block$b(ctx);
    					if_block.c();
    					if_block.m(span, null);
    				}
    			} else if (if_block) {
    				if_block.d(1);
    				if_block = null;
    			}

    			if (!current || dirty & /*listeners*/ 2 && span_data_tooltip_value !== (span_data_tooltip_value = typeof /*handler*/ ctx[3] == "function"
    			? /*handler*/ ctx[3]()
    			: /*handler*/ ctx[3])) {
    				attr(span, "data-tooltip", span_data_tooltip_value);
    			}
    		},
    		i(local) {
    			if (current) return;
    			transition_in(searchterm.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(searchterm.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(t0);
    			if (detaching) detach(span);
    			destroy_component(searchterm);
    			if (if_block) if_block.d();
    		}
    	};
    }

    function create_fragment$i(ctx) {
    	let each_blocks_1 = [];
    	let each0_lookup = new Map();
    	let each0_anchor;
    	let each1_anchor;
    	let current;
    	let each_value_1 = /*attributes*/ ctx[0];
    	const get_key = ctx => /*key*/ ctx[7];

    	for (let i = 0; i < each_value_1.length; i += 1) {
    		let child_ctx = get_each_context_1$1(ctx, each_value_1, i);
    		let key = get_key(child_ctx);
    		each0_lookup.set(key, each_blocks_1[i] = create_each_block_1$1(key, child_ctx));
    	}

    	let each_value = /*listeners*/ ctx[1];
    	let each_blocks = [];

    	for (let i = 0; i < each_value.length; i += 1) {
    		each_blocks[i] = create_each_block$4(get_each_context$4(ctx, each_value, i));
    	}

    	const out = i => transition_out(each_blocks[i], 1, 1, () => {
    		each_blocks[i] = null;
    	});

    	return {
    		c() {
    			for (let i = 0; i < each_blocks_1.length; i += 1) {
    				each_blocks_1[i].c();
    			}

    			each0_anchor = empty();

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].c();
    			}

    			each1_anchor = empty();
    		},
    		m(target, anchor) {
    			for (let i = 0; i < each_blocks_1.length; i += 1) {
    				each_blocks_1[i].m(target, anchor);
    			}

    			insert(target, each0_anchor, anchor);

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].m(target, anchor);
    			}

    			insert(target, each1_anchor, anchor);
    			current = true;
    		},
    		p(ctx, [dirty]) {
    			if (dirty & /*attributes*/ 1) {
    				const each_value_1 = /*attributes*/ ctx[0];
    				group_outros();
    				each_blocks_1 = update_keyed_each(each_blocks_1, dirty, get_key, 1, ctx, each_value_1, each0_lookup, each0_anchor.parentNode, outro_and_destroy_block, create_each_block_1$1, each0_anchor, get_each_context_1$1);
    				check_outros();
    			}

    			if (dirty & /*listeners*/ 2) {
    				each_value = /*listeners*/ ctx[1];
    				let i;

    				for (i = 0; i < each_value.length; i += 1) {
    					const child_ctx = get_each_context$4(ctx, each_value, i);

    					if (each_blocks[i]) {
    						each_blocks[i].p(child_ctx, dirty);
    						transition_in(each_blocks[i], 1);
    					} else {
    						each_blocks[i] = create_each_block$4(child_ctx);
    						each_blocks[i].c();
    						transition_in(each_blocks[i], 1);
    						each_blocks[i].m(each1_anchor.parentNode, each1_anchor);
    					}
    				}

    				group_outros();

    				for (i = each_value.length; i < each_blocks.length; i += 1) {
    					out(i);
    				}

    				check_outros();
    			}
    		},
    		i(local) {
    			if (current) return;

    			for (let i = 0; i < each_value_1.length; i += 1) {
    				transition_in(each_blocks_1[i]);
    			}

    			for (let i = 0; i < each_value.length; i += 1) {
    				transition_in(each_blocks[i]);
    			}

    			current = true;
    		},
    		o(local) {
    			for (let i = 0; i < each_blocks_1.length; i += 1) {
    				transition_out(each_blocks_1[i]);
    			}

    			each_blocks = each_blocks.filter(Boolean);

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				transition_out(each_blocks[i]);
    			}

    			current = false;
    		},
    		d(detaching) {
    			for (let i = 0; i < each_blocks_1.length; i += 1) {
    				each_blocks_1[i].d(detaching);
    			}

    			if (detaching) detach(each0_anchor);
    			destroy_each(each_blocks, detaching);
    			if (detaching) detach(each1_anchor);
    		}
    	};
    }

    function instance$h($$self, $$props, $$invalidate) {
    	let { attributes } = $$props;
    	let { listeners } = $$props;

    	$$self.$set = $$props => {
    		if ("attributes" in $$props) $$invalidate(0, attributes = $$props.attributes);
    		if ("listeners" in $$props) $$invalidate(1, listeners = $$props.listeners);
    	};

    	return [attributes, listeners];
    }

    class ElementAttributes extends SvelteComponent {
    	constructor(options) {
    		super();
    		init(this, options, instance$h, create_fragment$i, safe_not_equal, { attributes: 0, listeners: 1 });
    	}
    }

    /* src/nodes/Element.svelte generated by Svelte v3.20.1 */

    function create_else_block$6(ctx) {
    	let div;
    	let t0;
    	let span;
    	let t1;
    	let current;
    	const searchterm = new SearchTerm({ props: { text: /*tagName*/ ctx[5] } });

    	const elementattributes = new ElementAttributes({
    			props: {
    				attributes: /*_attributes*/ ctx[7],
    				listeners: /*listeners*/ ctx[6]
    			}
    		});

    	return {
    		c() {
    			div = element("div");
    			t0 = text("<");
    			span = element("span");
    			create_component(searchterm.$$.fragment);
    			create_component(elementattributes.$$.fragment);
    			t1 = text(" />");
    			attr(span, "class", "tag-name svelte-7cve9n");
    			attr(div, "style", /*style*/ ctx[1]);
    			attr(div, "class", "svelte-7cve9n");
    			toggle_class(div, "hover", /*hover*/ ctx[3]);
    			toggle_class(div, "selected", /*selected*/ ctx[4]);
    		},
    		m(target, anchor) {
    			insert(target, div, anchor);
    			append(div, t0);
    			append(div, span);
    			mount_component(searchterm, span, null);
    			mount_component(elementattributes, div, null);
    			append(div, t1);
    			current = true;
    		},
    		p(ctx, dirty) {
    			const searchterm_changes = {};
    			if (dirty & /*tagName*/ 32) searchterm_changes.text = /*tagName*/ ctx[5];
    			searchterm.$set(searchterm_changes);
    			const elementattributes_changes = {};
    			if (dirty & /*_attributes*/ 128) elementattributes_changes.attributes = /*_attributes*/ ctx[7];
    			if (dirty & /*listeners*/ 64) elementattributes_changes.listeners = /*listeners*/ ctx[6];
    			elementattributes.$set(elementattributes_changes);

    			if (!current || dirty & /*style*/ 2) {
    				attr(div, "style", /*style*/ ctx[1]);
    			}

    			if (dirty & /*hover*/ 8) {
    				toggle_class(div, "hover", /*hover*/ ctx[3]);
    			}

    			if (dirty & /*selected*/ 16) {
    				toggle_class(div, "selected", /*selected*/ ctx[4]);
    			}
    		},
    		i(local) {
    			if (current) return;
    			transition_in(searchterm.$$.fragment, local);
    			transition_in(elementattributes.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(searchterm.$$.fragment, local);
    			transition_out(elementattributes.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(div);
    			destroy_component(searchterm);
    			destroy_component(elementattributes);
    		}
    	};
    }

    // (63:11) {#if hasChildren}
    function create_if_block$c(ctx) {
    	let div;
    	let updating_collapsed;
    	let t0;
    	let span;
    	let t1;
    	let if_block1_anchor;
    	let current;
    	let dispose;

    	function collapse_collapsed_binding(value) {
    		/*collapse_collapsed_binding*/ ctx[12].call(null, value);
    	}

    	let collapse_props = { selected: /*selected*/ ctx[4] };

    	if (/*collapsed*/ ctx[0] !== void 0) {
    		collapse_props.collapsed = /*collapsed*/ ctx[0];
    	}

    	const collapse = new Collapse({ props: collapse_props });
    	binding_callbacks.push(() => bind(collapse, "collapsed", collapse_collapsed_binding));
    	const searchterm = new SearchTerm({ props: { text: /*tagName*/ ctx[5] } });

    	const elementattributes = new ElementAttributes({
    			props: {
    				attributes: /*_attributes*/ ctx[7],
    				listeners: /*listeners*/ ctx[6]
    			}
    		});

    	let if_block0 = /*collapsed*/ ctx[0] && create_if_block_2$4(ctx);
    	let if_block1 = !/*collapsed*/ ctx[0] && create_if_block_1$5(ctx);

    	return {
    		c() {
    			div = element("div");
    			create_component(collapse.$$.fragment);
    			t0 = text("<");
    			span = element("span");
    			create_component(searchterm.$$.fragment);
    			create_component(elementattributes.$$.fragment);
    			t1 = text(">");
    			if (if_block0) if_block0.c();
    			if (if_block1) if_block1.c();
    			if_block1_anchor = empty();
    			attr(span, "class", "tag-name svelte-7cve9n");
    			attr(div, "style", /*style*/ ctx[1]);
    			attr(div, "class", "svelte-7cve9n");
    			toggle_class(div, "hover", /*hover*/ ctx[3]);
    			toggle_class(div, "selected", /*selected*/ ctx[4]);
    		},
    		m(target, anchor, remount) {
    			insert(target, div, anchor);
    			mount_component(collapse, div, null);
    			append(div, t0);
    			append(div, span);
    			mount_component(searchterm, span, null);
    			mount_component(elementattributes, div, null);
    			append(div, t1);
    			if (if_block0) if_block0.m(div, null);
    			if (if_block1) if_block1.m(target, anchor);
    			insert(target, if_block1_anchor, anchor);
    			current = true;
    			if (remount) dispose();
    			dispose = listen(div, "dblclick", /*dblclick_handler*/ ctx[13]);
    		},
    		p(ctx, dirty) {
    			const collapse_changes = {};
    			if (dirty & /*selected*/ 16) collapse_changes.selected = /*selected*/ ctx[4];

    			if (!updating_collapsed && dirty & /*collapsed*/ 1) {
    				updating_collapsed = true;
    				collapse_changes.collapsed = /*collapsed*/ ctx[0];
    				add_flush_callback(() => updating_collapsed = false);
    			}

    			collapse.$set(collapse_changes);
    			const searchterm_changes = {};
    			if (dirty & /*tagName*/ 32) searchterm_changes.text = /*tagName*/ ctx[5];
    			searchterm.$set(searchterm_changes);
    			const elementattributes_changes = {};
    			if (dirty & /*_attributes*/ 128) elementattributes_changes.attributes = /*_attributes*/ ctx[7];
    			if (dirty & /*listeners*/ 64) elementattributes_changes.listeners = /*listeners*/ ctx[6];
    			elementattributes.$set(elementattributes_changes);

    			if (/*collapsed*/ ctx[0]) {
    				if (if_block0) {
    					if_block0.p(ctx, dirty);
    					transition_in(if_block0, 1);
    				} else {
    					if_block0 = create_if_block_2$4(ctx);
    					if_block0.c();
    					transition_in(if_block0, 1);
    					if_block0.m(div, null);
    				}
    			} else if (if_block0) {
    				group_outros();

    				transition_out(if_block0, 1, 1, () => {
    					if_block0 = null;
    				});

    				check_outros();
    			}

    			if (!current || dirty & /*style*/ 2) {
    				attr(div, "style", /*style*/ ctx[1]);
    			}

    			if (dirty & /*hover*/ 8) {
    				toggle_class(div, "hover", /*hover*/ ctx[3]);
    			}

    			if (dirty & /*selected*/ 16) {
    				toggle_class(div, "selected", /*selected*/ ctx[4]);
    			}

    			if (!/*collapsed*/ ctx[0]) {
    				if (if_block1) {
    					if_block1.p(ctx, dirty);
    					transition_in(if_block1, 1);
    				} else {
    					if_block1 = create_if_block_1$5(ctx);
    					if_block1.c();
    					transition_in(if_block1, 1);
    					if_block1.m(if_block1_anchor.parentNode, if_block1_anchor);
    				}
    			} else if (if_block1) {
    				group_outros();

    				transition_out(if_block1, 1, 1, () => {
    					if_block1 = null;
    				});

    				check_outros();
    			}
    		},
    		i(local) {
    			if (current) return;
    			transition_in(collapse.$$.fragment, local);
    			transition_in(searchterm.$$.fragment, local);
    			transition_in(elementattributes.$$.fragment, local);
    			transition_in(if_block0);
    			transition_in(if_block1);
    			current = true;
    		},
    		o(local) {
    			transition_out(collapse.$$.fragment, local);
    			transition_out(searchterm.$$.fragment, local);
    			transition_out(elementattributes.$$.fragment, local);
    			transition_out(if_block0);
    			transition_out(if_block1);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(div);
    			destroy_component(collapse);
    			destroy_component(searchterm);
    			destroy_component(elementattributes);
    			if (if_block0) if_block0.d();
    			if (if_block1) if_block1.d(detaching);
    			if (detaching) detach(if_block1_anchor);
    			dispose();
    		}
    	};
    }

    // (67:211) {#if collapsed}
    function create_if_block_2$4(ctx) {
    	let t0;
    	let span;
    	let t1;
    	let current;
    	const searchterm = new SearchTerm({ props: { text: /*tagName*/ ctx[5] } });

    	return {
    		c() {
    			t0 = text("…</");
    			span = element("span");
    			create_component(searchterm.$$.fragment);
    			t1 = text(">");
    			attr(span, "class", "tag-name svelte-7cve9n");
    		},
    		m(target, anchor) {
    			insert(target, t0, anchor);
    			insert(target, span, anchor);
    			mount_component(searchterm, span, null);
    			insert(target, t1, anchor);
    			current = true;
    		},
    		p(ctx, dirty) {
    			const searchterm_changes = {};
    			if (dirty & /*tagName*/ 32) searchterm_changes.text = /*tagName*/ ctx[5];
    			searchterm.$set(searchterm_changes);
    		},
    		i(local) {
    			if (current) return;
    			transition_in(searchterm.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(searchterm.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(t0);
    			if (detaching) detach(span);
    			destroy_component(searchterm);
    			if (detaching) detach(t1);
    		}
    	};
    }

    // (67:313) {#if !collapsed}
    function create_if_block_1$5(ctx) {
    	let div;
    	let t0;
    	let span;
    	let t1;
    	let current;
    	const default_slot_template = /*$$slots*/ ctx[11].default;
    	const default_slot = create_slot(default_slot_template, ctx, /*$$scope*/ ctx[10], null);
    	const searchterm = new SearchTerm({ props: { text: /*tagName*/ ctx[5] } });

    	return {
    		c() {
    			if (default_slot) default_slot.c();
    			div = element("div");
    			t0 = text("</");
    			span = element("span");
    			create_component(searchterm.$$.fragment);
    			t1 = text(">");
    			attr(span, "class", "tag-name svelte-7cve9n");
    			attr(div, "style", /*style*/ ctx[1]);
    			attr(div, "class", "svelte-7cve9n");
    			toggle_class(div, "hover", /*hover*/ ctx[3]);
    		},
    		m(target, anchor) {
    			if (default_slot) {
    				default_slot.m(target, anchor);
    			}

    			insert(target, div, anchor);
    			append(div, t0);
    			append(div, span);
    			mount_component(searchterm, span, null);
    			append(div, t1);
    			current = true;
    		},
    		p(ctx, dirty) {
    			if (default_slot) {
    				if (default_slot.p && dirty & /*$$scope*/ 1024) {
    					default_slot.p(get_slot_context(default_slot_template, ctx, /*$$scope*/ ctx[10], null), get_slot_changes(default_slot_template, /*$$scope*/ ctx[10], dirty, null));
    				}
    			}

    			const searchterm_changes = {};
    			if (dirty & /*tagName*/ 32) searchterm_changes.text = /*tagName*/ ctx[5];
    			searchterm.$set(searchterm_changes);

    			if (!current || dirty & /*style*/ 2) {
    				attr(div, "style", /*style*/ ctx[1]);
    			}

    			if (dirty & /*hover*/ 8) {
    				toggle_class(div, "hover", /*hover*/ ctx[3]);
    			}
    		},
    		i(local) {
    			if (current) return;
    			transition_in(default_slot, local);
    			transition_in(searchterm.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(default_slot, local);
    			transition_out(searchterm.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			if (default_slot) default_slot.d(detaching);
    			if (detaching) detach(div);
    			destroy_component(searchterm);
    		}
    	};
    }

    function create_fragment$j(ctx) {
    	let current_block_type_index;
    	let if_block;
    	let if_block_anchor;
    	let current;
    	const if_block_creators = [create_if_block$c, create_else_block$6];
    	const if_blocks = [];

    	function select_block_type(ctx, dirty) {
    		if (/*hasChildren*/ ctx[2]) return 0;
    		return 1;
    	}

    	current_block_type_index = select_block_type(ctx);
    	if_block = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);

    	return {
    		c() {
    			if_block.c();
    			if_block_anchor = empty();
    		},
    		m(target, anchor) {
    			if_blocks[current_block_type_index].m(target, anchor);
    			insert(target, if_block_anchor, anchor);
    			current = true;
    		},
    		p(ctx, [dirty]) {
    			let previous_block_index = current_block_type_index;
    			current_block_type_index = select_block_type(ctx);

    			if (current_block_type_index === previous_block_index) {
    				if_blocks[current_block_type_index].p(ctx, dirty);
    			} else {
    				group_outros();

    				transition_out(if_blocks[previous_block_index], 1, 1, () => {
    					if_blocks[previous_block_index] = null;
    				});

    				check_outros();
    				if_block = if_blocks[current_block_type_index];

    				if (!if_block) {
    					if_block = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);
    					if_block.c();
    				}

    				transition_in(if_block, 1);
    				if_block.m(if_block_anchor.parentNode, if_block_anchor);
    			}
    		},
    		i(local) {
    			if (current) return;
    			transition_in(if_block);
    			current = true;
    		},
    		o(local) {
    			transition_out(if_block);
    			current = false;
    		},
    		d(detaching) {
    			if_blocks[current_block_type_index].d(detaching);
    			if (detaching) detach(if_block_anchor);
    		}
    	};
    }

    function stringify$1(value) {
    	switch (typeof value) {
    		case "string":
    			return `"${value}"`;
    		case "undefined":
    			return "undefined";
    		case "number":
    			return value != value ? "NaN" : value.toString();
    		case "object":
    			if (value == null) return "null";
    			if (Array.isArray(value)) return `[${value.map(stringify$1).join(", ")}]`;
    			if (value.__isFunction) return value.name + "()";
    			if (value.__isSymbol) return value.name;
    			return `{${Object.entries(value).map(([key, value]) => `${key}: ${stringify$1(value)}`).join(", ")}}`;
    	}
    }

    function instance$i($$self, $$props, $$invalidate) {
    	let { style } = $$props;
    	let { hasChildren } = $$props;
    	let { hover } = $$props;
    	let { selected } = $$props;
    	let { tagName } = $$props;
    	let { attributes = [] } = $$props;
    	let { listeners = [] } = $$props;
    	let { collapsed } = $$props;
    	let _attributes;
    	let cache = {};
    	let { $$slots = {}, $$scope } = $$props;

    	function collapse_collapsed_binding(value) {
    		collapsed = value;
    		$$invalidate(0, collapsed);
    	}

    	const dblclick_handler = e => $$invalidate(0, collapsed = !collapsed);

    	$$self.$set = $$props => {
    		if ("style" in $$props) $$invalidate(1, style = $$props.style);
    		if ("hasChildren" in $$props) $$invalidate(2, hasChildren = $$props.hasChildren);
    		if ("hover" in $$props) $$invalidate(3, hover = $$props.hover);
    		if ("selected" in $$props) $$invalidate(4, selected = $$props.selected);
    		if ("tagName" in $$props) $$invalidate(5, tagName = $$props.tagName);
    		if ("attributes" in $$props) $$invalidate(8, attributes = $$props.attributes);
    		if ("listeners" in $$props) $$invalidate(6, listeners = $$props.listeners);
    		if ("collapsed" in $$props) $$invalidate(0, collapsed = $$props.collapsed);
    		if ("$$scope" in $$props) $$invalidate(10, $$scope = $$props.$$scope);
    	};

    	$$self.$$.update = () => {
    		if ($$self.$$.dirty & /*attributes, _attributes, cache*/ 896) {
    			 {
    				let localCache = {};

    				$$invalidate(7, _attributes = attributes.map(o => {
    					const value = stringify$1(o.value);
    					localCache[o.key] = value;

    					return {
    						...o,
    						value,
    						flash: !!_attributes && value != cache[o.key]
    					};
    				}));

    				$$invalidate(9, cache = localCache);
    			}
    		}
    	};

    	return [
    		collapsed,
    		style,
    		hasChildren,
    		hover,
    		selected,
    		tagName,
    		listeners,
    		_attributes,
    		attributes,
    		cache,
    		$$scope,
    		$$slots,
    		collapse_collapsed_binding,
    		dblclick_handler
    	];
    }

    class Element extends SvelteComponent {
    	constructor(options) {
    		super();

    		init(this, options, instance$i, create_fragment$j, safe_not_equal, {
    			style: 1,
    			hasChildren: 2,
    			hover: 3,
    			selected: 4,
    			tagName: 5,
    			attributes: 8,
    			listeners: 6,
    			collapsed: 0
    		});
    	}
    }

    /* src/nodes/Block.svelte generated by Svelte v3.20.1 */

    function create_else_block$7(ctx) {
    	let t0;
    	let t1;
    	let current;
    	const searchterm = new SearchTerm({ props: { text: /*tagName*/ ctx[4] } });

    	return {
    		c() {
    			t0 = text("{#");
    			create_component(searchterm.$$.fragment);
    			t1 = text("}");
    		},
    		m(target, anchor) {
    			insert(target, t0, anchor);
    			mount_component(searchterm, target, anchor);
    			insert(target, t1, anchor);
    			current = true;
    		},
    		p(ctx, dirty) {
    			const searchterm_changes = {};
    			if (dirty & /*tagName*/ 16) searchterm_changes.text = /*tagName*/ ctx[4];
    			searchterm.$set(searchterm_changes);
    		},
    		i(local) {
    			if (current) return;
    			transition_in(searchterm.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(searchterm.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(t0);
    			destroy_component(searchterm, detaching);
    			if (detaching) detach(t1);
    		}
    	};
    }

    // (30:84) {#if source}
    function create_if_block_2$5(ctx) {
    	let t;

    	return {
    		c() {
    			t = text(/*source*/ ctx[5]);
    		},
    		m(target, anchor) {
    			insert(target, t, anchor);
    		},
    		p(ctx, dirty) {
    			if (dirty & /*source*/ 32) set_data(t, /*source*/ ctx[5]);
    		},
    		i: noop,
    		o: noop,
    		d(detaching) {
    			if (detaching) detach(t);
    		}
    	};
    }

    // (30:162) {#if collapsed}
    function create_if_block_1$6(ctx) {
    	let t0;
    	let t1;
    	let current;
    	const searchterm = new SearchTerm({ props: { text: /*tagName*/ ctx[4] } });

    	return {
    		c() {
    			t0 = text("…{/");
    			create_component(searchterm.$$.fragment);
    			t1 = text("}");
    		},
    		m(target, anchor) {
    			insert(target, t0, anchor);
    			mount_component(searchterm, target, anchor);
    			insert(target, t1, anchor);
    			current = true;
    		},
    		p(ctx, dirty) {
    			const searchterm_changes = {};
    			if (dirty & /*tagName*/ 16) searchterm_changes.text = /*tagName*/ ctx[4];
    			searchterm.$set(searchterm_changes);
    		},
    		i(local) {
    			if (current) return;
    			transition_in(searchterm.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(searchterm.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(t0);
    			destroy_component(searchterm, detaching);
    			if (detaching) detach(t1);
    		}
    	};
    }

    // (30:242) {#if !collapsed}
    function create_if_block$d(ctx) {
    	let div;
    	let t0;
    	let t1;
    	let current;
    	const default_slot_template = /*$$slots*/ ctx[7].default;
    	const default_slot = create_slot(default_slot_template, ctx, /*$$scope*/ ctx[6], null);
    	const searchterm = new SearchTerm({ props: { text: /*tagName*/ ctx[4] } });

    	return {
    		c() {
    			if (default_slot) default_slot.c();
    			div = element("div");
    			t0 = text("{/");
    			create_component(searchterm.$$.fragment);
    			t1 = text("}");
    			attr(div, "class", "tag-close tag-name svelte-1b39do0");
    			attr(div, "style", /*style*/ ctx[1]);
    			toggle_class(div, "hover", /*hover*/ ctx[2]);
    		},
    		m(target, anchor) {
    			if (default_slot) {
    				default_slot.m(target, anchor);
    			}

    			insert(target, div, anchor);
    			append(div, t0);
    			mount_component(searchterm, div, null);
    			append(div, t1);
    			current = true;
    		},
    		p(ctx, dirty) {
    			if (default_slot) {
    				if (default_slot.p && dirty & /*$$scope*/ 64) {
    					default_slot.p(get_slot_context(default_slot_template, ctx, /*$$scope*/ ctx[6], null), get_slot_changes(default_slot_template, /*$$scope*/ ctx[6], dirty, null));
    				}
    			}

    			const searchterm_changes = {};
    			if (dirty & /*tagName*/ 16) searchterm_changes.text = /*tagName*/ ctx[4];
    			searchterm.$set(searchterm_changes);

    			if (!current || dirty & /*style*/ 2) {
    				attr(div, "style", /*style*/ ctx[1]);
    			}

    			if (dirty & /*hover*/ 4) {
    				toggle_class(div, "hover", /*hover*/ ctx[2]);
    			}
    		},
    		i(local) {
    			if (current) return;
    			transition_in(default_slot, local);
    			transition_in(searchterm.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(default_slot, local);
    			transition_out(searchterm.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			if (default_slot) default_slot.d(detaching);
    			if (detaching) detach(div);
    			destroy_component(searchterm);
    		}
    	};
    }

    function create_fragment$k(ctx) {
    	let div;
    	let updating_collapsed;
    	let current_block_type_index;
    	let if_block0;
    	let if_block0_anchor;
    	let if_block2_anchor;
    	let current;
    	let dispose;

    	function collapse_collapsed_binding(value) {
    		/*collapse_collapsed_binding*/ ctx[8].call(null, value);
    	}

    	let collapse_props = { selected: /*selected*/ ctx[3] };

    	if (/*collapsed*/ ctx[0] !== void 0) {
    		collapse_props.collapsed = /*collapsed*/ ctx[0];
    	}

    	const collapse = new Collapse({ props: collapse_props });
    	binding_callbacks.push(() => bind(collapse, "collapsed", collapse_collapsed_binding));
    	const if_block_creators = [create_if_block_2$5, create_else_block$7];
    	const if_blocks = [];

    	function select_block_type(ctx, dirty) {
    		if (/*source*/ ctx[5]) return 0;
    		return 1;
    	}

    	current_block_type_index = select_block_type(ctx);
    	if_block0 = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);
    	let if_block1 = /*collapsed*/ ctx[0] && create_if_block_1$6(ctx);
    	let if_block2 = !/*collapsed*/ ctx[0] && create_if_block$d(ctx);

    	return {
    		c() {
    			div = element("div");
    			create_component(collapse.$$.fragment);
    			if_block0.c();
    			if_block0_anchor = empty();
    			if (if_block1) if_block1.c();
    			if (if_block2) if_block2.c();
    			if_block2_anchor = empty();
    			attr(div, "class", "tag-open tag-name svelte-1b39do0");
    			attr(div, "style", /*style*/ ctx[1]);
    			toggle_class(div, "hover", /*hover*/ ctx[2]);
    			toggle_class(div, "selected", /*selected*/ ctx[3]);
    		},
    		m(target, anchor, remount) {
    			insert(target, div, anchor);
    			mount_component(collapse, div, null);
    			if_blocks[current_block_type_index].m(div, null);
    			append(div, if_block0_anchor);
    			if (if_block1) if_block1.m(div, null);
    			if (if_block2) if_block2.m(target, anchor);
    			insert(target, if_block2_anchor, anchor);
    			current = true;
    			if (remount) dispose();
    			dispose = listen(div, "dblclick", /*dblclick_handler*/ ctx[9]);
    		},
    		p(ctx, [dirty]) {
    			const collapse_changes = {};
    			if (dirty & /*selected*/ 8) collapse_changes.selected = /*selected*/ ctx[3];

    			if (!updating_collapsed && dirty & /*collapsed*/ 1) {
    				updating_collapsed = true;
    				collapse_changes.collapsed = /*collapsed*/ ctx[0];
    				add_flush_callback(() => updating_collapsed = false);
    			}

    			collapse.$set(collapse_changes);
    			let previous_block_index = current_block_type_index;
    			current_block_type_index = select_block_type(ctx);

    			if (current_block_type_index === previous_block_index) {
    				if_blocks[current_block_type_index].p(ctx, dirty);
    			} else {
    				group_outros();

    				transition_out(if_blocks[previous_block_index], 1, 1, () => {
    					if_blocks[previous_block_index] = null;
    				});

    				check_outros();
    				if_block0 = if_blocks[current_block_type_index];

    				if (!if_block0) {
    					if_block0 = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);
    					if_block0.c();
    				}

    				transition_in(if_block0, 1);
    				if_block0.m(div, if_block0_anchor);
    			}

    			if (/*collapsed*/ ctx[0]) {
    				if (if_block1) {
    					if_block1.p(ctx, dirty);
    					transition_in(if_block1, 1);
    				} else {
    					if_block1 = create_if_block_1$6(ctx);
    					if_block1.c();
    					transition_in(if_block1, 1);
    					if_block1.m(div, null);
    				}
    			} else if (if_block1) {
    				group_outros();

    				transition_out(if_block1, 1, 1, () => {
    					if_block1 = null;
    				});

    				check_outros();
    			}

    			if (!current || dirty & /*style*/ 2) {
    				attr(div, "style", /*style*/ ctx[1]);
    			}

    			if (dirty & /*hover*/ 4) {
    				toggle_class(div, "hover", /*hover*/ ctx[2]);
    			}

    			if (dirty & /*selected*/ 8) {
    				toggle_class(div, "selected", /*selected*/ ctx[3]);
    			}

    			if (!/*collapsed*/ ctx[0]) {
    				if (if_block2) {
    					if_block2.p(ctx, dirty);
    					transition_in(if_block2, 1);
    				} else {
    					if_block2 = create_if_block$d(ctx);
    					if_block2.c();
    					transition_in(if_block2, 1);
    					if_block2.m(if_block2_anchor.parentNode, if_block2_anchor);
    				}
    			} else if (if_block2) {
    				group_outros();

    				transition_out(if_block2, 1, 1, () => {
    					if_block2 = null;
    				});

    				check_outros();
    			}
    		},
    		i(local) {
    			if (current) return;
    			transition_in(collapse.$$.fragment, local);
    			transition_in(if_block0);
    			transition_in(if_block1);
    			transition_in(if_block2);
    			current = true;
    		},
    		o(local) {
    			transition_out(collapse.$$.fragment, local);
    			transition_out(if_block0);
    			transition_out(if_block1);
    			transition_out(if_block2);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(div);
    			destroy_component(collapse);
    			if_blocks[current_block_type_index].d();
    			if (if_block1) if_block1.d();
    			if (if_block2) if_block2.d(detaching);
    			if (detaching) detach(if_block2_anchor);
    			dispose();
    		}
    	};
    }

    function instance$j($$self, $$props, $$invalidate) {
    	let { style } = $$props;
    	let { hover } = $$props;
    	let { selected } = $$props;
    	let { tagName } = $$props;
    	let { source } = $$props;
    	let { collapsed } = $$props;
    	let { $$slots = {}, $$scope } = $$props;

    	function collapse_collapsed_binding(value) {
    		collapsed = value;
    		$$invalidate(0, collapsed);
    	}

    	const dblclick_handler = e => $$invalidate(0, collapsed = !collapsed);

    	$$self.$set = $$props => {
    		if ("style" in $$props) $$invalidate(1, style = $$props.style);
    		if ("hover" in $$props) $$invalidate(2, hover = $$props.hover);
    		if ("selected" in $$props) $$invalidate(3, selected = $$props.selected);
    		if ("tagName" in $$props) $$invalidate(4, tagName = $$props.tagName);
    		if ("source" in $$props) $$invalidate(5, source = $$props.source);
    		if ("collapsed" in $$props) $$invalidate(0, collapsed = $$props.collapsed);
    		if ("$$scope" in $$props) $$invalidate(6, $$scope = $$props.$$scope);
    	};

    	return [
    		collapsed,
    		style,
    		hover,
    		selected,
    		tagName,
    		source,
    		$$scope,
    		$$slots,
    		collapse_collapsed_binding,
    		dblclick_handler
    	];
    }

    class Block extends SvelteComponent {
    	constructor(options) {
    		super();

    		init(this, options, instance$j, create_fragment$k, safe_not_equal, {
    			style: 1,
    			hover: 2,
    			selected: 3,
    			tagName: 4,
    			source: 5,
    			collapsed: 0
    		});
    	}
    }

    /* src/nodes/Slot.svelte generated by Svelte v3.20.1 */

    function create_if_block_1$7(ctx) {
    	let t0;
    	let t1;
    	let current;
    	const searchterm = new SearchTerm({ props: { text: /*tagName*/ ctx[4] } });

    	return {
    		c() {
    			t0 = text("…</");
    			create_component(searchterm.$$.fragment);
    			t1 = text(">");
    		},
    		m(target, anchor) {
    			insert(target, t0, anchor);
    			mount_component(searchterm, target, anchor);
    			insert(target, t1, anchor);
    			current = true;
    		},
    		p(ctx, dirty) {
    			const searchterm_changes = {};
    			if (dirty & /*tagName*/ 16) searchterm_changes.text = /*tagName*/ ctx[4];
    			searchterm.$set(searchterm_changes);
    		},
    		i(local) {
    			if (current) return;
    			transition_in(searchterm.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(searchterm.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(t0);
    			destroy_component(searchterm, detaching);
    			if (detaching) detach(t1);
    		}
    	};
    }

    // (29:193) {#if !collapsed}
    function create_if_block$e(ctx) {
    	let div;
    	let t0;
    	let t1;
    	let current;
    	const default_slot_template = /*$$slots*/ ctx[6].default;
    	const default_slot = create_slot(default_slot_template, ctx, /*$$scope*/ ctx[5], null);
    	const searchterm = new SearchTerm({ props: { text: /*tagName*/ ctx[4] } });

    	return {
    		c() {
    			if (default_slot) default_slot.c();
    			div = element("div");
    			t0 = text("</");
    			create_component(searchterm.$$.fragment);
    			t1 = text(">");
    			attr(div, "class", "tag-close tag-name svelte-1effmoc");
    			attr(div, "style", /*style*/ ctx[1]);
    			toggle_class(div, "hover", /*hover*/ ctx[2]);
    		},
    		m(target, anchor) {
    			if (default_slot) {
    				default_slot.m(target, anchor);
    			}

    			insert(target, div, anchor);
    			append(div, t0);
    			mount_component(searchterm, div, null);
    			append(div, t1);
    			current = true;
    		},
    		p(ctx, dirty) {
    			if (default_slot) {
    				if (default_slot.p && dirty & /*$$scope*/ 32) {
    					default_slot.p(get_slot_context(default_slot_template, ctx, /*$$scope*/ ctx[5], null), get_slot_changes(default_slot_template, /*$$scope*/ ctx[5], dirty, null));
    				}
    			}

    			const searchterm_changes = {};
    			if (dirty & /*tagName*/ 16) searchterm_changes.text = /*tagName*/ ctx[4];
    			searchterm.$set(searchterm_changes);

    			if (!current || dirty & /*style*/ 2) {
    				attr(div, "style", /*style*/ ctx[1]);
    			}

    			if (dirty & /*hover*/ 4) {
    				toggle_class(div, "hover", /*hover*/ ctx[2]);
    			}
    		},
    		i(local) {
    			if (current) return;
    			transition_in(default_slot, local);
    			transition_in(searchterm.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(default_slot, local);
    			transition_out(searchterm.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			if (default_slot) default_slot.d(detaching);
    			if (detaching) detach(div);
    			destroy_component(searchterm);
    		}
    	};
    }

    function create_fragment$l(ctx) {
    	let div;
    	let updating_collapsed;
    	let t0;
    	let t1;
    	let if_block1_anchor;
    	let current;
    	let dispose;

    	function collapse_collapsed_binding(value) {
    		/*collapse_collapsed_binding*/ ctx[7].call(null, value);
    	}

    	let collapse_props = { selected: /*selected*/ ctx[3] };

    	if (/*collapsed*/ ctx[0] !== void 0) {
    		collapse_props.collapsed = /*collapsed*/ ctx[0];
    	}

    	const collapse = new Collapse({ props: collapse_props });
    	binding_callbacks.push(() => bind(collapse, "collapsed", collapse_collapsed_binding));
    	const searchterm = new SearchTerm({ props: { text: /*tagName*/ ctx[4] } });
    	let if_block0 = /*collapsed*/ ctx[0] && create_if_block_1$7(ctx);
    	let if_block1 = !/*collapsed*/ ctx[0] && create_if_block$e(ctx);

    	return {
    		c() {
    			div = element("div");
    			create_component(collapse.$$.fragment);
    			t0 = text("<");
    			create_component(searchterm.$$.fragment);
    			t1 = text(">");
    			if (if_block0) if_block0.c();
    			if (if_block1) if_block1.c();
    			if_block1_anchor = empty();
    			attr(div, "class", "tag-open tag-name svelte-1effmoc");
    			attr(div, "style", /*style*/ ctx[1]);
    			toggle_class(div, "hover", /*hover*/ ctx[2]);
    			toggle_class(div, "selected", /*selected*/ ctx[3]);
    		},
    		m(target, anchor, remount) {
    			insert(target, div, anchor);
    			mount_component(collapse, div, null);
    			append(div, t0);
    			mount_component(searchterm, div, null);
    			append(div, t1);
    			if (if_block0) if_block0.m(div, null);
    			if (if_block1) if_block1.m(target, anchor);
    			insert(target, if_block1_anchor, anchor);
    			current = true;
    			if (remount) dispose();
    			dispose = listen(div, "dblclick", /*dblclick_handler*/ ctx[8]);
    		},
    		p(ctx, [dirty]) {
    			const collapse_changes = {};
    			if (dirty & /*selected*/ 8) collapse_changes.selected = /*selected*/ ctx[3];

    			if (!updating_collapsed && dirty & /*collapsed*/ 1) {
    				updating_collapsed = true;
    				collapse_changes.collapsed = /*collapsed*/ ctx[0];
    				add_flush_callback(() => updating_collapsed = false);
    			}

    			collapse.$set(collapse_changes);
    			const searchterm_changes = {};
    			if (dirty & /*tagName*/ 16) searchterm_changes.text = /*tagName*/ ctx[4];
    			searchterm.$set(searchterm_changes);

    			if (/*collapsed*/ ctx[0]) {
    				if (if_block0) {
    					if_block0.p(ctx, dirty);
    					transition_in(if_block0, 1);
    				} else {
    					if_block0 = create_if_block_1$7(ctx);
    					if_block0.c();
    					transition_in(if_block0, 1);
    					if_block0.m(div, null);
    				}
    			} else if (if_block0) {
    				group_outros();

    				transition_out(if_block0, 1, 1, () => {
    					if_block0 = null;
    				});

    				check_outros();
    			}

    			if (!current || dirty & /*style*/ 2) {
    				attr(div, "style", /*style*/ ctx[1]);
    			}

    			if (dirty & /*hover*/ 4) {
    				toggle_class(div, "hover", /*hover*/ ctx[2]);
    			}

    			if (dirty & /*selected*/ 8) {
    				toggle_class(div, "selected", /*selected*/ ctx[3]);
    			}

    			if (!/*collapsed*/ ctx[0]) {
    				if (if_block1) {
    					if_block1.p(ctx, dirty);
    					transition_in(if_block1, 1);
    				} else {
    					if_block1 = create_if_block$e(ctx);
    					if_block1.c();
    					transition_in(if_block1, 1);
    					if_block1.m(if_block1_anchor.parentNode, if_block1_anchor);
    				}
    			} else if (if_block1) {
    				group_outros();

    				transition_out(if_block1, 1, 1, () => {
    					if_block1 = null;
    				});

    				check_outros();
    			}
    		},
    		i(local) {
    			if (current) return;
    			transition_in(collapse.$$.fragment, local);
    			transition_in(searchterm.$$.fragment, local);
    			transition_in(if_block0);
    			transition_in(if_block1);
    			current = true;
    		},
    		o(local) {
    			transition_out(collapse.$$.fragment, local);
    			transition_out(searchterm.$$.fragment, local);
    			transition_out(if_block0);
    			transition_out(if_block1);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(div);
    			destroy_component(collapse);
    			destroy_component(searchterm);
    			if (if_block0) if_block0.d();
    			if (if_block1) if_block1.d(detaching);
    			if (detaching) detach(if_block1_anchor);
    			dispose();
    		}
    	};
    }

    function instance$k($$self, $$props, $$invalidate) {
    	let { style } = $$props;
    	let { hover } = $$props;
    	let { selected } = $$props;
    	let { tagName } = $$props;
    	let { collapsed } = $$props;
    	let { $$slots = {}, $$scope } = $$props;

    	function collapse_collapsed_binding(value) {
    		collapsed = value;
    		$$invalidate(0, collapsed);
    	}

    	const dblclick_handler = e => $$invalidate(0, collapsed = !collapsed);

    	$$self.$set = $$props => {
    		if ("style" in $$props) $$invalidate(1, style = $$props.style);
    		if ("hover" in $$props) $$invalidate(2, hover = $$props.hover);
    		if ("selected" in $$props) $$invalidate(3, selected = $$props.selected);
    		if ("tagName" in $$props) $$invalidate(4, tagName = $$props.tagName);
    		if ("collapsed" in $$props) $$invalidate(0, collapsed = $$props.collapsed);
    		if ("$$scope" in $$props) $$invalidate(5, $$scope = $$props.$$scope);
    	};

    	return [
    		collapsed,
    		style,
    		hover,
    		selected,
    		tagName,
    		$$scope,
    		$$slots,
    		collapse_collapsed_binding,
    		dblclick_handler
    	];
    }

    class Slot extends SvelteComponent {
    	constructor(options) {
    		super();

    		init(this, options, instance$k, create_fragment$l, safe_not_equal, {
    			style: 1,
    			hover: 2,
    			selected: 3,
    			tagName: 4,
    			collapsed: 0
    		});
    	}
    }

    /* src/nodes/Iteration.svelte generated by Svelte v3.20.1 */

    function create_fragment$m(ctx) {
    	let div;
    	let t;
    	let current;
    	const default_slot_template = /*$$slots*/ ctx[4].default;
    	const default_slot = create_slot(default_slot_template, ctx, /*$$scope*/ ctx[3], null);

    	return {
    		c() {
    			div = element("div");
    			t = text("↪");
    			if (default_slot) default_slot.c();
    			attr(div, "style", /*style*/ ctx[0]);
    			attr(div, "class", "svelte-1b39do0");
    			toggle_class(div, "hover", /*hover*/ ctx[1]);
    			toggle_class(div, "selected", /*selected*/ ctx[2]);
    		},
    		m(target, anchor) {
    			insert(target, div, anchor);
    			append(div, t);

    			if (default_slot) {
    				default_slot.m(target, anchor);
    			}

    			current = true;
    		},
    		p(ctx, [dirty]) {
    			if (!current || dirty & /*style*/ 1) {
    				attr(div, "style", /*style*/ ctx[0]);
    			}

    			if (dirty & /*hover*/ 2) {
    				toggle_class(div, "hover", /*hover*/ ctx[1]);
    			}

    			if (dirty & /*selected*/ 4) {
    				toggle_class(div, "selected", /*selected*/ ctx[2]);
    			}

    			if (default_slot) {
    				if (default_slot.p && dirty & /*$$scope*/ 8) {
    					default_slot.p(get_slot_context(default_slot_template, ctx, /*$$scope*/ ctx[3], null), get_slot_changes(default_slot_template, /*$$scope*/ ctx[3], dirty, null));
    				}
    			}
    		},
    		i(local) {
    			if (current) return;
    			transition_in(default_slot, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(default_slot, local);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(div);
    			if (default_slot) default_slot.d(detaching);
    		}
    	};
    }

    function instance$l($$self, $$props, $$invalidate) {
    	let { style } = $$props;
    	let { hover } = $$props;
    	let { selected } = $$props;
    	let { $$slots = {}, $$scope } = $$props;

    	$$self.$set = $$props => {
    		if ("style" in $$props) $$invalidate(0, style = $$props.style);
    		if ("hover" in $$props) $$invalidate(1, hover = $$props.hover);
    		if ("selected" in $$props) $$invalidate(2, selected = $$props.selected);
    		if ("$$scope" in $$props) $$invalidate(3, $$scope = $$props.$$scope);
    	};

    	return [style, hover, selected, $$scope, $$slots];
    }

    class Iteration extends SvelteComponent {
    	constructor(options) {
    		super();
    		init(this, options, instance$l, create_fragment$m, safe_not_equal, { style: 0, hover: 1, selected: 2 });
    	}
    }

    /* src/nodes/Text.svelte generated by Svelte v3.20.1 */

    function create_fragment$n(ctx) {
    	let div;
    	let current;
    	const searchterm = new SearchTerm({ props: { text: /*nodeValue*/ ctx[1] } });

    	return {
    		c() {
    			div = element("div");
    			create_component(searchterm.$$.fragment);
    			attr(div, "style", /*style*/ ctx[0]);
    		},
    		m(target, anchor) {
    			insert(target, div, anchor);
    			mount_component(searchterm, div, null);
    			current = true;
    		},
    		p(ctx, [dirty]) {
    			const searchterm_changes = {};
    			if (dirty & /*nodeValue*/ 2) searchterm_changes.text = /*nodeValue*/ ctx[1];
    			searchterm.$set(searchterm_changes);

    			if (!current || dirty & /*style*/ 1) {
    				attr(div, "style", /*style*/ ctx[0]);
    			}
    		},
    		i(local) {
    			if (current) return;
    			transition_in(searchterm.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(searchterm.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(div);
    			destroy_component(searchterm);
    		}
    	};
    }

    function instance$m($$self, $$props, $$invalidate) {
    	let { style } = $$props;
    	let { nodeValue } = $$props;

    	$$self.$set = $$props => {
    		if ("style" in $$props) $$invalidate(0, style = $$props.style);
    		if ("nodeValue" in $$props) $$invalidate(1, nodeValue = $$props.nodeValue);
    	};

    	return [style, nodeValue];
    }

    class Text extends SvelteComponent {
    	constructor(options) {
    		super();
    		init(this, options, instance$m, create_fragment$n, safe_not_equal, { style: 0, nodeValue: 1 });
    	}
    }

    /* src/nodes/Anchor.svelte generated by Svelte v3.20.1 */

    function create_fragment$o(ctx) {
    	let div;
    	let t;

    	return {
    		c() {
    			div = element("div");
    			t = text("#anchor");
    			attr(div, "style", /*style*/ ctx[0]);
    			attr(div, "class", "svelte-1oevsoq");
    		},
    		m(target, anchor) {
    			insert(target, div, anchor);
    			append(div, t);
    		},
    		p(ctx, [dirty]) {
    			if (dirty & /*style*/ 1) {
    				attr(div, "style", /*style*/ ctx[0]);
    			}
    		},
    		i: noop,
    		o: noop,
    		d(detaching) {
    			if (detaching) detach(div);
    		}
    	};
    }

    function instance$n($$self, $$props, $$invalidate) {
    	let { style } = $$props;

    	$$self.$set = $$props => {
    		if ("style" in $$props) $$invalidate(0, style = $$props.style);
    	};

    	return [style];
    }

    class Anchor extends SvelteComponent {
    	constructor(options) {
    		super();
    		init(this, options, instance$n, create_fragment$o, safe_not_equal, { style: 0 });
    	}
    }

    /* src/nodes/Node.svelte generated by Svelte v3.20.1 */

    function get_each_context_1$2(ctx, list, i) {
    	const child_ctx = ctx.slice();
    	child_ctx[0] = list[i];
    	return child_ctx;
    }

    function get_each_context$5(ctx, list, i) {
    	const child_ctx = ctx.slice();
    	child_ctx[14] = list[i];
    	return child_ctx;
    }

    // (108:103) {:else}
    function create_else_block$8(ctx) {
    	let each_blocks = [];
    	let each_1_lookup = new Map();
    	let each_1_anchor;
    	let current;
    	let each_value_1 = /*node*/ ctx[0].children;
    	const get_key = ctx => /*node*/ ctx[0].id;

    	for (let i = 0; i < each_value_1.length; i += 1) {
    		let child_ctx = get_each_context_1$2(ctx, each_value_1, i);
    		let key = get_key(child_ctx);
    		each_1_lookup.set(key, each_blocks[i] = create_each_block_1$2(key, child_ctx));
    	}

    	return {
    		c() {
    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].c();
    			}

    			each_1_anchor = empty();
    		},
    		m(target, anchor) {
    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].m(target, anchor);
    			}

    			insert(target, each_1_anchor, anchor);
    			current = true;
    		},
    		p(ctx, dirty) {
    			if (dirty & /*node, depth*/ 3) {
    				const each_value_1 = /*node*/ ctx[0].children;
    				group_outros();
    				each_blocks = update_keyed_each(each_blocks, dirty, get_key, 1, ctx, each_value_1, each_1_lookup, each_1_anchor.parentNode, outro_and_destroy_block, create_each_block_1$2, each_1_anchor, get_each_context_1$2);
    				check_outros();
    			}
    		},
    		i(local) {
    			if (current) return;

    			for (let i = 0; i < each_value_1.length; i += 1) {
    				transition_in(each_blocks[i]);
    			}

    			current = true;
    		},
    		o(local) {
    			for (let i = 0; i < each_blocks.length; i += 1) {
    				transition_out(each_blocks[i]);
    			}

    			current = false;
    		},
    		d(detaching) {
    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].d(detaching);
    			}

    			if (detaching) detach(each_1_anchor);
    		}
    	};
    }

    // (93:11) {#if $visibility[node.type]}
    function create_if_block$f(ctx) {
    	let li;
    	let updating_collapsed;
    	let current;
    	let dispose;

    	const switch_instance_spread_levels = [
    		{ tagName: /*node*/ ctx[0].tagName },
    		/*node*/ ctx[0].detail,
    		{
    			hasChildren: /*node*/ ctx[0].children.length != 0
    		},
    		{
    			hover: /*$hoveredNodeId*/ ctx[5] == /*node*/ ctx[0].id
    		},
    		{
    			selected: /*$selectedNode*/ ctx[6].id == /*node*/ ctx[0].id
    		},
    		{
    			style: `padding-left: ${/*depth*/ ctx[1] * 12}px`
    		}
    	];

    	function switch_instance_collapsed_binding(value) {
    		/*switch_instance_collapsed_binding*/ ctx[9].call(null, value);
    	}

    	var switch_value = /*nodeType*/ ctx[3];

    	function switch_props(ctx) {
    		let switch_instance_props = {
    			$$slots: { default: [create_default_slot$6] },
    			$$scope: { ctx }
    		};

    		for (let i = 0; i < switch_instance_spread_levels.length; i += 1) {
    			switch_instance_props = assign(switch_instance_props, switch_instance_spread_levels[i]);
    		}

    		if (/*node*/ ctx[0].collapsed !== void 0) {
    			switch_instance_props.collapsed = /*node*/ ctx[0].collapsed;
    		}

    		return { props: switch_instance_props };
    	}

    	if (switch_value) {
    		var switch_instance = new switch_value(switch_props(ctx));
    		binding_callbacks.push(() => bind(switch_instance, "collapsed", switch_instance_collapsed_binding));
    	}

    	return {
    		c() {
    			li = element("li");
    			if (switch_instance) create_component(switch_instance.$$.fragment);
    			attr(li, "class", "svelte-1d2wche");
    			toggle_class(li, "flash", /*flash*/ ctx[2]);
    		},
    		m(target, anchor, remount) {
    			insert(target, li, anchor);

    			if (switch_instance) {
    				mount_component(switch_instance, li, null);
    			}

    			/*li_binding*/ ctx[10](li);
    			current = true;
    			if (remount) run_all(dispose);

    			dispose = [
    				listen(li, "animationend", /*animationend_handler*/ ctx[11]),
    				listen(li, "mouseover", stop_propagation(/*mouseover_handler*/ ctx[12])),
    				listen(li, "click", stop_propagation(/*click_handler*/ ctx[13]))
    			];
    		},
    		p(ctx, dirty) {
    			const switch_instance_changes = (dirty & /*node, $hoveredNodeId, $selectedNode, depth*/ 99)
    			? get_spread_update(switch_instance_spread_levels, [
    					dirty & /*node*/ 1 && { tagName: /*node*/ ctx[0].tagName },
    					dirty & /*node*/ 1 && get_spread_object(/*node*/ ctx[0].detail),
    					dirty & /*node*/ 1 && {
    						hasChildren: /*node*/ ctx[0].children.length != 0
    					},
    					dirty & /*$hoveredNodeId, node*/ 33 && {
    						hover: /*$hoveredNodeId*/ ctx[5] == /*node*/ ctx[0].id
    					},
    					dirty & /*$selectedNode, node*/ 65 && {
    						selected: /*$selectedNode*/ ctx[6].id == /*node*/ ctx[0].id
    					},
    					dirty & /*depth*/ 2 && {
    						style: `padding-left: ${/*depth*/ ctx[1] * 12}px`
    					}
    				])
    			: {};

    			if (dirty & /*$$scope, node, depth, $selectedNode*/ 524355) {
    				switch_instance_changes.$$scope = { dirty, ctx };
    			}

    			if (!updating_collapsed && dirty & /*node*/ 1) {
    				updating_collapsed = true;
    				switch_instance_changes.collapsed = /*node*/ ctx[0].collapsed;
    				add_flush_callback(() => updating_collapsed = false);
    			}

    			if (switch_value !== (switch_value = /*nodeType*/ ctx[3])) {
    				if (switch_instance) {
    					group_outros();
    					const old_component = switch_instance;

    					transition_out(old_component.$$.fragment, 1, 0, () => {
    						destroy_component(old_component, 1);
    					});

    					check_outros();
    				}

    				if (switch_value) {
    					switch_instance = new switch_value(switch_props(ctx));
    					binding_callbacks.push(() => bind(switch_instance, "collapsed", switch_instance_collapsed_binding));
    					create_component(switch_instance.$$.fragment);
    					transition_in(switch_instance.$$.fragment, 1);
    					mount_component(switch_instance, li, null);
    				} else {
    					switch_instance = null;
    				}
    			} else if (switch_value) {
    				switch_instance.$set(switch_instance_changes);
    			}

    			if (dirty & /*flash*/ 4) {
    				toggle_class(li, "flash", /*flash*/ ctx[2]);
    			}
    		},
    		i(local) {
    			if (current) return;
    			if (switch_instance) transition_in(switch_instance.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			if (switch_instance) transition_out(switch_instance.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(li);
    			if (switch_instance) destroy_component(switch_instance);
    			/*li_binding*/ ctx[10](null);
    			run_all(dispose);
    		}
    	};
    }

    // (108:110) {#each node.children as node (node.id)}
    function create_each_block_1$2(key_1, ctx) {
    	let first;
    	let current;

    	const node_1 = new Node({
    			props: {
    				node: /*node*/ ctx[0],
    				depth: /*depth*/ ctx[1]
    			}
    		});

    	return {
    		key: key_1,
    		first: null,
    		c() {
    			first = empty();
    			create_component(node_1.$$.fragment);
    			this.first = first;
    		},
    		m(target, anchor) {
    			insert(target, first, anchor);
    			mount_component(node_1, target, anchor);
    			current = true;
    		},
    		p(ctx, dirty) {
    			const node_1_changes = {};
    			if (dirty & /*node*/ 1) node_1_changes.node = /*node*/ ctx[0];
    			if (dirty & /*depth*/ 2) node_1_changes.depth = /*depth*/ ctx[1];
    			node_1.$set(node_1_changes);
    		},
    		i(local) {
    			if (current) return;
    			transition_in(node_1.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(node_1.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(first);
    			destroy_component(node_1, detaching);
    		}
    	};
    }

    // (106:46) {#if $selectedNode.id == node.id}
    function create_if_block_1$8(ctx) {
    	let span;
    	let span_style_value;

    	return {
    		c() {
    			span = element("span");
    			attr(span, "style", span_style_value = `left: ${/*depth*/ ctx[1] * 12 + 6}px`);
    			attr(span, "class", "svelte-1d2wche");
    		},
    		m(target, anchor) {
    			insert(target, span, anchor);
    		},
    		p(ctx, dirty) {
    			if (dirty & /*depth*/ 2 && span_style_value !== (span_style_value = `left: ${/*depth*/ ctx[1] * 12 + 6}px`)) {
    				attr(span, "style", span_style_value);
    			}
    		},
    		d(detaching) {
    			if (detaching) detach(span);
    		}
    	};
    }

    // (106:132) {#each node.children as child (child.id)}
    function create_each_block$5(key_1, ctx) {
    	let first;
    	let current;

    	const node_1 = new Node({
    			props: {
    				node: /*child*/ ctx[14],
    				depth: /*node*/ ctx[0].type == "iteration"
    				? /*depth*/ ctx[1]
    				: /*depth*/ ctx[1] + 1
    			}
    		});

    	return {
    		key: key_1,
    		first: null,
    		c() {
    			first = empty();
    			create_component(node_1.$$.fragment);
    			this.first = first;
    		},
    		m(target, anchor) {
    			insert(target, first, anchor);
    			mount_component(node_1, target, anchor);
    			current = true;
    		},
    		p(ctx, dirty) {
    			const node_1_changes = {};
    			if (dirty & /*node*/ 1) node_1_changes.node = /*child*/ ctx[14];

    			if (dirty & /*node, depth*/ 3) node_1_changes.depth = /*node*/ ctx[0].type == "iteration"
    			? /*depth*/ ctx[1]
    			: /*depth*/ ctx[1] + 1;

    			node_1.$set(node_1_changes);
    		},
    		i(local) {
    			if (current) return;
    			transition_in(node_1.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(node_1.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(first);
    			destroy_component(node_1, detaching);
    		}
    	};
    }

    // (98:59) <svelte:component       this={nodeType}       tagName={node.tagName}       bind:collapsed={node.collapsed}       {...node.detail}       hasChildren={node.children.length != 0}       hover={$hoveredNodeId == node.id}       selected={$selectedNode.id == node.id}       style={`padding-left: ${depth * 12}px`}>
    function create_default_slot$6(ctx) {
    	let ul;
    	let each_blocks = [];
    	let each_1_lookup = new Map();
    	let current;
    	let if_block = /*$selectedNode*/ ctx[6].id == /*node*/ ctx[0].id && create_if_block_1$8(ctx);
    	let each_value = /*node*/ ctx[0].children;
    	const get_key = ctx => /*child*/ ctx[14].id;

    	for (let i = 0; i < each_value.length; i += 1) {
    		let child_ctx = get_each_context$5(ctx, each_value, i);
    		let key = get_key(child_ctx);
    		each_1_lookup.set(key, each_blocks[i] = create_each_block$5(key, child_ctx));
    	}

    	return {
    		c() {
    			if (if_block) if_block.c();
    			ul = element("ul");

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].c();
    			}
    		},
    		m(target, anchor) {
    			if (if_block) if_block.m(target, anchor);
    			insert(target, ul, anchor);

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].m(ul, null);
    			}

    			current = true;
    		},
    		p(ctx, dirty) {
    			if (/*$selectedNode*/ ctx[6].id == /*node*/ ctx[0].id) {
    				if (if_block) {
    					if_block.p(ctx, dirty);
    				} else {
    					if_block = create_if_block_1$8(ctx);
    					if_block.c();
    					if_block.m(ul.parentNode, ul);
    				}
    			} else if (if_block) {
    				if_block.d(1);
    				if_block = null;
    			}

    			if (dirty & /*node, depth*/ 3) {
    				const each_value = /*node*/ ctx[0].children;
    				group_outros();
    				each_blocks = update_keyed_each(each_blocks, dirty, get_key, 1, ctx, each_value, each_1_lookup, ul, outro_and_destroy_block, create_each_block$5, null, get_each_context$5);
    				check_outros();
    			}
    		},
    		i(local) {
    			if (current) return;

    			for (let i = 0; i < each_value.length; i += 1) {
    				transition_in(each_blocks[i]);
    			}

    			current = true;
    		},
    		o(local) {
    			for (let i = 0; i < each_blocks.length; i += 1) {
    				transition_out(each_blocks[i]);
    			}

    			current = false;
    		},
    		d(detaching) {
    			if (if_block) if_block.d(detaching);
    			if (detaching) detach(ul);

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].d();
    			}
    		}
    	};
    }

    function create_fragment$p(ctx) {
    	let current_block_type_index;
    	let if_block;
    	let if_block_anchor;
    	let current;
    	const if_block_creators = [create_if_block$f, create_else_block$8];
    	const if_blocks = [];

    	function select_block_type(ctx, dirty) {
    		if (/*$visibility*/ ctx[4][/*node*/ ctx[0].type]) return 0;
    		return 1;
    	}

    	current_block_type_index = select_block_type(ctx);
    	if_block = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);

    	return {
    		c() {
    			if_block.c();
    			if_block_anchor = empty();
    		},
    		m(target, anchor) {
    			if_blocks[current_block_type_index].m(target, anchor);
    			insert(target, if_block_anchor, anchor);
    			current = true;
    		},
    		p(ctx, [dirty]) {
    			let previous_block_index = current_block_type_index;
    			current_block_type_index = select_block_type(ctx);

    			if (current_block_type_index === previous_block_index) {
    				if_blocks[current_block_type_index].p(ctx, dirty);
    			} else {
    				group_outros();

    				transition_out(if_blocks[previous_block_index], 1, 1, () => {
    					if_blocks[previous_block_index] = null;
    				});

    				check_outros();
    				if_block = if_blocks[current_block_type_index];

    				if (!if_block) {
    					if_block = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);
    					if_block.c();
    				}

    				transition_in(if_block, 1);
    				if_block.m(if_block_anchor.parentNode, if_block_anchor);
    			}
    		},
    		i(local) {
    			if (current) return;
    			transition_in(if_block);
    			current = true;
    		},
    		o(local) {
    			transition_out(if_block);
    			current = false;
    		},
    		d(detaching) {
    			if_blocks[current_block_type_index].d(detaching);
    			if (detaching) detach(if_block_anchor);
    		}
    	};
    }

    function instance$o($$self, $$props, $$invalidate) {
    	let $visibility;
    	let $hoveredNodeId;
    	let $selectedNode;
    	component_subscribe($$self, visibility, $$value => $$invalidate(4, $visibility = $$value));
    	component_subscribe($$self, hoveredNodeId, $$value => $$invalidate(5, $hoveredNodeId = $$value));
    	component_subscribe($$self, selectedNode, $$value => $$invalidate(6, $selectedNode = $$value));
    	let { node } = $$props;
    	let { depth = 1 } = $$props;
    	let _timeout = null;

    	node.invalidate = () => {
    		if (_timeout) return;

    		_timeout = setTimeout(
    			() => {
    				_timeout = null;
    				$$invalidate(0, node);
    			},
    			100
    		);
    	};

    	let lastLength = node.children.length;
    	let flash = false;

    	function switch_instance_collapsed_binding(value) {
    		node.collapsed = value;
    		$$invalidate(0, node);
    	}

    	function li_binding($$value) {
    		binding_callbacks[$$value ? "unshift" : "push"](() => {
    			node.dom = $$value;
    			$$invalidate(0, node);
    		});
    	}

    	const animationend_handler = e => $$invalidate(2, flash = false);
    	const mouseover_handler = e => set_store_value(hoveredNodeId, $hoveredNodeId = node.id);
    	const click_handler = e => set_store_value(selectedNode, $selectedNode = node);

    	$$self.$set = $$props => {
    		if ("node" in $$props) $$invalidate(0, node = $$props.node);
    		if ("depth" in $$props) $$invalidate(1, depth = $$props.depth);
    	};

    	let nodeType;

    	$$self.$$.update = () => {
    		if ($$self.$$.dirty & /*node*/ 1) {
    			 $$invalidate(3, nodeType = ({
    				element: Element,
    				component: Element,
    				block: Block,
    				slot: Slot,
    				iteration: Iteration,
    				text: Text,
    				anchor: Anchor
    			})[node.type]);
    		}

    		if ($$self.$$.dirty & /*flash, node, lastLength*/ 261) {
    			 {
    				$$invalidate(2, flash = flash || node.children.length != lastLength);
    				$$invalidate(8, lastLength = node.children.length);
    			}
    		}
    	};

    	return [
    		node,
    		depth,
    		flash,
    		nodeType,
    		$visibility,
    		$hoveredNodeId,
    		$selectedNode,
    		_timeout,
    		lastLength,
    		switch_instance_collapsed_binding,
    		li_binding,
    		animationend_handler,
    		mouseover_handler,
    		click_handler
    	];
    }

    class Node extends SvelteComponent {
    	constructor(options) {
    		super();
    		init(this, options, instance$o, create_fragment$p, safe_not_equal, { node: 0, depth: 1 });
    	}
    }

    /* src/App.svelte generated by Svelte v3.20.1 */

    function get_each_context$6(ctx, list, i) {
    	const child_ctx = ctx.slice();
    	child_ctx[4] = list[i];
    	return child_ctx;
    }

    // (32:339) {:else}
    function create_else_block$9(ctx) {
    	let current;
    	const connectmessage = new ConnectMessage({});

    	return {
    		c() {
    			create_component(connectmessage.$$.fragment);
    		},
    		m(target, anchor) {
    			mount_component(connectmessage, target, anchor);
    			current = true;
    		},
    		p: noop,
    		i(local) {
    			if (current) return;
    			transition_in(connectmessage.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(connectmessage.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			destroy_component(connectmessage, detaching);
    		}
    	};
    }

    // (32:84) 
    function create_if_block_1$9(ctx) {
    	let div;
    	let ul;
    	let each_blocks = [];
    	let each_1_lookup = new Map();
    	let current;
    	let dispose;

    	const toolbar = new Toolbar({
    			props: {
    				$$slots: { default: [create_default_slot$7] },
    				$$scope: { ctx }
    			}
    		});

    	let each_value = /*$rootNodes*/ ctx[1];
    	const get_key = ctx => /*node*/ ctx[4].id;

    	for (let i = 0; i < each_value.length; i += 1) {
    		let child_ctx = get_each_context$6(ctx, each_value, i);
    		let key = get_key(child_ctx);
    		each_1_lookup.set(key, each_blocks[i] = create_each_block$6(key, child_ctx));
    	}

    	const breadcrumbs = new Breadcrumbs({});
    	const componentview = new ComponentView({});

    	return {
    		c() {
    			div = element("div");
    			create_component(toolbar.$$.fragment);
    			ul = element("ul");

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].c();
    			}

    			create_component(breadcrumbs.$$.fragment);
    			create_component(componentview.$$.fragment);
    			attr(ul, "class", "svelte-t02eo5");
    			attr(div, "class", "node-tree svelte-t02eo5");
    		},
    		m(target, anchor, remount) {
    			insert(target, div, anchor);
    			mount_component(toolbar, div, null);
    			append(div, ul);

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].m(ul, null);
    			}

    			mount_component(breadcrumbs, div, null);
    			mount_component(componentview, target, anchor);
    			current = true;
    			if (remount) dispose();
    			dispose = listen(ul, "mouseleave", /*mouseleave_handler*/ ctx[3]);
    		},
    		p(ctx, dirty) {
    			const toolbar_changes = {};

    			if (dirty & /*$$scope*/ 128) {
    				toolbar_changes.$$scope = { dirty, ctx };
    			}

    			toolbar.$set(toolbar_changes);

    			if (dirty & /*$rootNodes*/ 2) {
    				const each_value = /*$rootNodes*/ ctx[1];
    				group_outros();
    				each_blocks = update_keyed_each(each_blocks, dirty, get_key, 1, ctx, each_value, each_1_lookup, ul, outro_and_destroy_block, create_each_block$6, null, get_each_context$6);
    				check_outros();
    			}
    		},
    		i(local) {
    			if (current) return;
    			transition_in(toolbar.$$.fragment, local);

    			for (let i = 0; i < each_value.length; i += 1) {
    				transition_in(each_blocks[i]);
    			}

    			transition_in(breadcrumbs.$$.fragment, local);
    			transition_in(componentview.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(toolbar.$$.fragment, local);

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				transition_out(each_blocks[i]);
    			}

    			transition_out(breadcrumbs.$$.fragment, local);
    			transition_out(componentview.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(div);
    			destroy_component(toolbar);

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].d();
    			}

    			destroy_component(breadcrumbs);
    			destroy_component(componentview, detaching);
    			dispose();
    		}
    	};
    }

    // (32:11) {#if $profilerEnabled}
    function create_if_block$g(ctx) {
    	let div;
    	let current;
    	const profiler = new Profiler({});

    	return {
    		c() {
    			div = element("div");
    			create_component(profiler.$$.fragment);
    			attr(div, "class", "svelte-t02eo5");
    		},
    		m(target, anchor) {
    			insert(target, div, anchor);
    			mount_component(profiler, div, null);
    			current = true;
    		},
    		p: noop,
    		i(local) {
    			if (current) return;
    			transition_in(profiler.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(profiler.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(div);
    			destroy_component(profiler);
    		}
    	};
    }

    // (32:107) <Toolbar>
    function create_default_slot$7(ctx) {
    	let current;
    	const profilebutton = new ProfileButton({});
    	const pickerbutton = new PickerButton({});
    	const visibilitybutton = new VisibilityButton({});
    	const search = new Search({});

    	return {
    		c() {
    			create_component(profilebutton.$$.fragment);
    			create_component(pickerbutton.$$.fragment);
    			create_component(visibilitybutton.$$.fragment);
    			create_component(search.$$.fragment);
    		},
    		m(target, anchor) {
    			mount_component(profilebutton, target, anchor);
    			mount_component(pickerbutton, target, anchor);
    			mount_component(visibilitybutton, target, anchor);
    			mount_component(search, target, anchor);
    			current = true;
    		},
    		i(local) {
    			if (current) return;
    			transition_in(profilebutton.$$.fragment, local);
    			transition_in(pickerbutton.$$.fragment, local);
    			transition_in(visibilitybutton.$$.fragment, local);
    			transition_in(search.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(profilebutton.$$.fragment, local);
    			transition_out(pickerbutton.$$.fragment, local);
    			transition_out(visibilitybutton.$$.fragment, local);
    			transition_out(search.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			destroy_component(profilebutton, detaching);
    			destroy_component(pickerbutton, detaching);
    			destroy_component(visibilitybutton, detaching);
    			destroy_component(search, detaching);
    		}
    	};
    }

    // (32:238) {#each $rootNodes as node (node.id)}
    function create_each_block$6(key_1, ctx) {
    	let first;
    	let current;
    	const node = new Node({ props: { node: /*node*/ ctx[4] } });

    	return {
    		key: key_1,
    		first: null,
    		c() {
    			first = empty();
    			create_component(node.$$.fragment);
    			this.first = first;
    		},
    		m(target, anchor) {
    			insert(target, first, anchor);
    			mount_component(node, target, anchor);
    			current = true;
    		},
    		p(ctx, dirty) {
    			const node_changes = {};
    			if (dirty & /*$rootNodes*/ 2) node_changes.node = /*node*/ ctx[4];
    			node.$set(node_changes);
    		},
    		i(local) {
    			if (current) return;
    			transition_in(node.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(node.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(first);
    			destroy_component(node, detaching);
    		}
    	};
    }

    function create_fragment$q(ctx) {
    	let current_block_type_index;
    	let if_block;
    	let if_block_anchor;
    	let current;
    	const if_block_creators = [create_if_block$g, create_if_block_1$9, create_else_block$9];
    	const if_blocks = [];

    	function select_block_type(ctx, dirty) {
    		if (/*$profilerEnabled*/ ctx[0]) return 0;
    		if (/*$rootNodes*/ ctx[1].length) return 1;
    		return 2;
    	}

    	current_block_type_index = select_block_type(ctx);
    	if_block = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);

    	return {
    		c() {
    			if_block.c();
    			if_block_anchor = empty();
    		},
    		m(target, anchor) {
    			if_blocks[current_block_type_index].m(target, anchor);
    			insert(target, if_block_anchor, anchor);
    			current = true;
    		},
    		p(ctx, [dirty]) {
    			let previous_block_index = current_block_type_index;
    			current_block_type_index = select_block_type(ctx);

    			if (current_block_type_index === previous_block_index) {
    				if_blocks[current_block_type_index].p(ctx, dirty);
    			} else {
    				group_outros();

    				transition_out(if_blocks[previous_block_index], 1, 1, () => {
    					if_blocks[previous_block_index] = null;
    				});

    				check_outros();
    				if_block = if_blocks[current_block_type_index];

    				if (!if_block) {
    					if_block = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);
    					if_block.c();
    				}

    				transition_in(if_block, 1);
    				if_block.m(if_block_anchor.parentNode, if_block_anchor);
    			}
    		},
    		i(local) {
    			if (current) return;
    			transition_in(if_block);
    			current = true;
    		},
    		o(local) {
    			transition_out(if_block);
    			current = false;
    		},
    		d(detaching) {
    			if_blocks[current_block_type_index].d(detaching);
    			if (detaching) detach(if_block_anchor);
    		}
    	};
    }

    function instance$p($$self, $$props, $$invalidate) {
    	let $profilerEnabled;
    	let $rootNodes;
    	let $hoveredNodeId;
    	component_subscribe($$self, profilerEnabled, $$value => $$invalidate(0, $profilerEnabled = $$value));
    	component_subscribe($$self, rootNodes, $$value => $$invalidate(1, $rootNodes = $$value));
    	component_subscribe($$self, hoveredNodeId, $$value => $$invalidate(2, $hoveredNodeId = $$value));
    	const mouseleave_handler = e => set_store_value(hoveredNodeId, $hoveredNodeId = null);
    	return [$profilerEnabled, $rootNodes, $hoveredNodeId, mouseleave_handler];
    }

    class App extends SvelteComponent {
    	constructor(options) {
    		super();
    		init(this, options, instance$p, create_fragment$q, safe_not_equal, {});
    	}
    }

    if (typeof browser == 'undefined') document.body.classList.add('chrome');

    function setDarkMode(theme) {
      if (theme == 'dark') document.body.classList.add('dark');
      else document.body.classList.remove('dark');
    }

    setDarkMode(chrome$1.devtools.panels.themeName);
    if (chrome$1.devtools.panels.onThemeChanged)
      chrome$1.devtools.panels.onThemeChanged.addListener(setDarkMode);

    new App({ target: document.body });

}(chrome));
