import React from 'react';
import '@testing-library/jest-dom';
import { render } from '@testing-library/react';
import { FlyoWysiwyg, WysiwygNode, WysiwygJson } from './client';

// Mock @flyo/nitro-js-bridge – re-implement the real wysiwyg renderer so
// tests exercise the actual HTML output the component will produce.
jest.mock('@flyo/nitro-js-bridge', () => {
  // Minimal but faithful ProseMirror/TipTap JSON → HTML renderer
  // (mirrors the logic shipped in nitro-js-bridge)
  function renderNode(node: Record<string, unknown>): string {
    const content = node.content as Record<string, unknown>[] | undefined;
    const attrs = node.attrs as Record<string, unknown> | undefined;
    const children = (content || []).map(renderNode).join('');

    switch (node.type) {
      case 'doc':
        return children;
      case 'text': {
        let text = (node.text as string) || '';
        // basic HTML escaping
        text = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        const marks = node.marks as Array<{ type: string; attrs?: Record<string, unknown> }> | undefined;
        if (marks) {
          for (const mark of marks) {
            switch (mark.type) {
              case 'bold':
                text = `<strong>${text}</strong>`;
                break;
              case 'italic':
                text = `<em>${text}</em>`;
                break;
              case 'underline':
                text = `<u>${text}</u>`;
                break;
              case 'link':
                text = `<a href="${mark.attrs?.href}" target="${mark.attrs?.target}">${text}</a>`;
                break;
            }
          }
        }
        return text;
      }
      case 'paragraph':
        return `<p>${children}</p>`;
      case 'heading':
        return `<h${attrs?.level}>${children}</h${attrs?.level}>`;
      case 'bulletList':
        return `<ul>${children}</ul>`;
      case 'orderedList':
        return `<ol>${children}</ol>`;
      case 'listItem':
        return `<li>${children}</li>`;
      case 'blockquote':
        return `<blockquote>${children}</blockquote>`;
      case 'hardBreak':
        return '<br />';
      case 'image':
        return `<img src="${attrs?.src}" alt="${attrs?.alt}" />`;
      default:
        return children;
    }
  }

  return {
    wysiwyg: (json: Record<string, unknown>) => renderNode(json),
    highlightAndClick: jest.fn(),
    reload: jest.fn(),
  };
});

// ---------------------------------------------------------------------------
// Test data that mirrors real Flyo CMS output
// ---------------------------------------------------------------------------

const docJson: WysiwygJson = {
  type: 'doc',
  content: [
    {
      type: 'heading',
      attrs: { level: 1 },
      content: [{ type: 'text', text: 'What is Lorem Ipsum?' }],
    },
    {
      type: 'heading',
      attrs: { level: 2 },
      content: [{ type: 'text', text: 'Test' }],
    },
    {
      type: 'heading',
      attrs: { level: 3 },
      content: [{ type: 'text', text: 'Test 3' }],
    },
    {
      type: 'paragraph',
      content: [
        { type: 'text', marks: [{ type: 'bold' }], text: 'Lorem Ipsum' },
        {
          type: 'text',
          text: ' is simply dummy text of the printing and typesetting industry.',
        },
      ],
    },
    {
      type: 'bulletList',
      content: [
        { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Test 1' }] }] },
        { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Test 2' }] }] },
      ],
    },
    {
      type: 'paragraph',
      content: [{ type: 'text', text: 'HIHI' }],
    },
    {
      type: 'orderedList',
      content: [
        { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Test 3' }] }] },
        { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Test 4' }] }] },
      ],
    },
  ],
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('FlyoWysiwyg', () => {
  // ── Wrapper & className ───────────────────────────────────────────────

  it('wraps output in a div with default className "wysiwyg"', () => {
    const { container } = render(<FlyoWysiwyg json={docJson} />);
    const wrapper = container.firstElementChild!;
    expect(wrapper.tagName).toBe('DIV');
    expect(wrapper.className).toBe('wysiwyg');
  });

  it('accepts a custom className', () => {
    const { container } = render(<FlyoWysiwyg json={docJson} className="prose" />);
    const wrapper = container.firstElementChild!;
    expect(wrapper.className).toBe('prose');
  });

  // ── No extra wrapper divs ─────────────────────────────────────────────

  it('does NOT wrap each node in an extra div', () => {
    const { container } = render(<FlyoWysiwyg json={docJson} />);
    const wrapper = container.firstElementChild!;

    // Direct children of the wrapper should be the actual elements (h1, h2, …),
    // NOT intermediate <div> wrappers.
    const children = Array.from(wrapper.children);
    const tagNames = children.map((el) => el.tagName);

    expect(tagNames).toEqual(['H1', 'H2', 'H3', 'P', 'UL', 'P', 'OL']);
  });

  it('renders the correct h1 text', () => {
    const { container } = render(<FlyoWysiwyg json={docJson} />);
    expect(container.querySelector('h1')!.textContent).toBe('What is Lorem Ipsum?');
  });

  it('renders bold marks inside paragraph', () => {
    const { container } = render(<FlyoWysiwyg json={docJson} />);
    const strong = container.querySelector('p strong');
    expect(strong).not.toBeNull();
    expect(strong!.textContent).toBe('Lorem Ipsum');
  });

  it('renders bullet list items', () => {
    const { container } = render(<FlyoWysiwyg json={docJson} />);
    const items = container.querySelectorAll('ul li');
    expect(items).toHaveLength(2);
    expect(items[0].textContent).toBe('Test 1');
    expect(items[1].textContent).toBe('Test 2');
  });

  it('renders ordered list items', () => {
    const { container } = render(<FlyoWysiwyg json={docJson} />);
    const items = container.querySelectorAll('ol li');
    expect(items).toHaveLength(2);
    expect(items[0].textContent).toBe('Test 3');
    expect(items[1].textContent).toBe('Test 4');
  });

  // ── Edge: empty / null / undefined ────────────────────────────────────

  it('renders an empty wrapper div when json is undefined', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { container } = render(<FlyoWysiwyg json={undefined as any} />);
    const wrapper = container.firstElementChild!;
    expect(wrapper.tagName).toBe('DIV');
    expect(wrapper.className).toBe('wysiwyg');
    expect(wrapper.innerHTML).toBe('');
  });

  it('renders an empty wrapper div when json is null', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { container } = render(<FlyoWysiwyg json={null as any} />);
    const wrapper = container.firstElementChild!;
    expect(wrapper.innerHTML).toBe('');
  });

  // ── Edge: array of nodes (no doc wrapper) ─────────────────────────────

  it('handles a plain array of nodes', () => {
    const nodes: WysiwygNode[] = [
      { type: 'paragraph', content: [{ type: 'text', text: 'First' }] },
      { type: 'paragraph', content: [{ type: 'text', text: 'Second' }] },
    ];
    const { container } = render(<FlyoWysiwyg json={nodes} />);
    const wrapper = container.firstElementChild!;
    const paragraphs = wrapper.querySelectorAll('p');
    expect(paragraphs).toHaveLength(2);
    expect(paragraphs[0].textContent).toBe('First');
    expect(paragraphs[1].textContent).toBe('Second');
  });

  // ── Edge: single node (not wrapped in doc) ────────────────────────────

  it('handles a single node object', () => {
    const node: WysiwygNode = { type: 'paragraph', content: [{ type: 'text', text: 'Solo' }] };
    const { container } = render(<FlyoWysiwyg json={node} />);
    expect(container.querySelector('p')!.textContent).toBe('Solo');
  });

  // ── Custom components ─────────────────────────────────────────────────

  it('renders custom component for a node type', () => {
    const json: WysiwygJson = {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'Before' }] },
        { type: 'image', attrs: { src: 'photo.jpg', alt: 'Photo' } },
        { type: 'paragraph', content: [{ type: 'text', text: 'After' }] },
      ],
    };

    function CustomImage({ node }: { node: WysiwygNode }) {
      const attrs = node.attrs as Record<string, string>;
      return <figure data-testid="custom-img"><img src={attrs.src} alt={attrs.alt} /></figure>;
    }

    const { container, getByTestId } = render(
      <FlyoWysiwyg json={json} components={{ image: CustomImage }} />
    );

    // Custom component should be rendered
    const fig = getByTestId('custom-img');
    expect(fig.querySelector('img')!.getAttribute('src')).toBe('photo.jpg');

    // Surrounding paragraphs should still render correctly
    const paragraphs = container.querySelectorAll('p');
    expect(paragraphs).toHaveLength(2);
    expect(paragraphs[0].textContent).toBe('Before');
    expect(paragraphs[1].textContent).toBe('After');
  });

  it('groups consecutive HTML nodes when custom components split them', () => {
    const json: WysiwygJson = {
      type: 'doc',
      content: [
        { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Title' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'Intro' }] },
        { type: 'image', attrs: { src: 'a.jpg', alt: 'A' } },
        { type: 'paragraph', content: [{ type: 'text', text: 'Middle' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'Also middle' }] },
        { type: 'image', attrs: { src: 'b.jpg', alt: 'B' } },
        { type: 'paragraph', content: [{ type: 'text', text: 'End' }] },
      ],
    };

    function Img({ node }: { node: WysiwygNode }) {
      const attrs = node.attrs as Record<string, string>;
      return <img data-custom="true" src={attrs.src} alt={attrs.alt} />;
    }

    const { container } = render(
      <FlyoWysiwyg json={json} components={{ image: Img }} />
    );

    const wrapper = container.firstElementChild!;
    // Expected direct children: div(h1+p), img, div(p+p), img, div(p)
    // = 5 direct children (3 html groups + 2 custom components)
    expect(wrapper.children).toHaveLength(5);

    // The custom images
    const customImgs = wrapper.querySelectorAll('img[data-custom]');
    expect(customImgs).toHaveLength(2);
  });

  it('still wraps with className when using custom components', () => {
    const json: WysiwygJson = {
      type: 'doc',
      content: [
        { type: 'image', attrs: { src: 'x.jpg', alt: '' } },
      ],
    };

    function Img({ node }: { node: WysiwygNode }) {
      const attrs = node.attrs as Record<string, string>;
      return <img src={attrs.src} alt={attrs.alt} />;
    }

    const { container } = render(
      <FlyoWysiwyg json={json} className="rich-text" components={{ image: Img }} />
    );

    expect(container.firstElementChild!.className).toBe('rich-text');
  });

  // ── Doc with only one node ────────────────────────────────────────────

  it('renders a doc with a single paragraph', () => {
    const json: WysiwygJson = {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'Hello World' }] },
      ],
    };

    const { container } = render(<FlyoWysiwyg json={json} />);
    const wrapper = container.firstElementChild!;
    expect(wrapper.children).toHaveLength(1);
    expect(wrapper.children[0].tagName).toBe('P');
    expect(wrapper.children[0].textContent).toBe('Hello World');
  });

  // ── Doc with empty content array ──────────────────────────────────────

  it('renders an empty wrapper when doc has empty content', () => {
    const json: WysiwygJson = { type: 'doc', content: [] };
    const { container } = render(<FlyoWysiwyg json={json} />);
    expect(container.firstElementChild!.innerHTML).toBe('');
  });
});
