// widget/src/chat-widget.js — Widget source placeholder
const template = document.createElement('template');
template.innerHTML = '<div class="chat-widget"><div class="chat-header">Chat</div></div>';

export class ChatWidget extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.shadowRoot.appendChild(template.content.cloneNode(true));
  }
}

customElements.define('chat-widget', ChatWidget);
