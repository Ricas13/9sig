import { Children, cloneElement, isValidElement, useId, type ReactElement, type ReactNode } from "react";

// A form field whose label is programmatically tied to its control, so screen readers announce what
// each input is for and tapping the label focuses the input. The control is found inside the children
// (it may be wrapped, for example in a currency prefix box) and receives the generated id.
const CONTROLS = new Set(["input", "select", "textarea"]);

function attach(node: ReactNode, id: string, state: { done: boolean; id: string }): ReactNode {
  return Children.map(node, (child) => {
    if (state.done || !isValidElement(child)) return child;
    const element = child as ReactElement<{ id?: string; children?: ReactNode }>;
    if (typeof element.type === "string" && CONTROLS.has(element.type)) {
      state.done = true;
      state.id = element.props.id ?? id;
      return element.props.id ? element : cloneElement(element, { id });
    }
    if (element.props.children !== undefined) {
      const inner = attach(element.props.children, id, state);
      return state.done ? cloneElement(element, undefined, inner) : element;
    }
    return element;
  });
}

export function Field({ className = "field", label, children }: { className?: string; label: ReactNode; children: ReactNode }) {
  const generated = useId();
  const state = { done: false, id: generated };
  const content = attach(children, generated, state);
  return <div className={className}><label htmlFor={state.id}>{label}</label>{content}</div>;
}
