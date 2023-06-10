import { Memento } from "vscode";
export interface Template {
  name: string;
  path: string;
}

export class Storage{
  private readonly key: string = `low-code-templates`;
  constructor(private memento: Memento) {

  }
  list():Template[] {
    return this.memento.get(this.key, []);
  }
  save(template:Template) {
    const list = this.list();
    for (const iterator of list) {
      if (iterator.path === template.path) {
        return 'already exists';
      }
    }
    list.push(template);
    this.memento.update(this.key, list);
  }
}

export class DefaultTemplateStorage{
  private readonly key: string = `low-code-default-template`;
  constructor(private memento: Memento) {
  }
  get():Template {
    return this.memento.get(this.key, null);
  }
  save(template:Template) {
    this.memento.update(this.key, template);
  }
}