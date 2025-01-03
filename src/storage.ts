import { Memento } from "vscode";
export interface Template {
  name: string;
  path: string;
}

export class Storage {
  private readonly key: string = `low-code-templates`;
  constructor(private memento: Memento) {

  }
  list(): Template[] {
    return this.memento.get(this.key, []);
  }
  save(template: Template) {
    const list = this.list();
    //delete if template.name already exists
    const index = list.findIndex((element) => element.name === template.name);
    if (index !== -1) {
        list.splice(index, 1);
    }
    list.push(template);
    this.memento.update(this.key, list);
  }
  get(name: string): Template {
    const list = this.list();
    for (const iterator of list) {
      if (iterator.name === name) {
        return iterator;
      }
    }
    return null;
  }
  deleteMany(name: string[]) {
    const list = this.list();
    const newList = list.filter(item => !name.includes(item.name));
    this.memento.update(this.key, newList);
  }
  deleteAll(){
    this.memento.update(this.key, []);
  }
}

export class DefaultTemplateStorage {
  private readonly key: string = `low-code-default-template`;
  constructor(private memento: Memento) {
  }
  get(): Template {
    return this.memento.get(this.key, null);
  }
  save(template: Template) {
    this.memento.update(this.key, template);
  }
}