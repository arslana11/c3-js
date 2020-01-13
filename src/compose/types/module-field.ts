import { Apply, CortezaID, NoID } from '../../cast'
import { IsOf } from '../../guards'

const FieldNameValidator = /^\w{1,}$/

interface RawModuleField {
  fieldID?: string;
  name?: string;
  kind?: string;
  label?: string;
  helpText?: string;
  defaultValue?: string|string[];
  maxLength?: number;
  isRequired?: boolean;
  isPrivate?: boolean;
  isMulti?: boolean;
  isSystem?: boolean;
  canUpdateRecordValue?: boolean;
  canReadRecordValue?: boolean;
  options?: object;
}

class ModuleField {
  public fieldID = NoID
  public name = ''
  public kind = ''
  public label = ''

  public defaultValue: string | string[] | undefined
  public maxLength = 0

  public isRequired = false
  public isPrivate = false
  public isMulti = false
  public isSystem = false

  public options: object = {}

  public canUpdateRecordValue = false
  public canReadRecordValue = false

  constructor (f?: RawModuleField | ModuleField) {
    this.apply(f)
  }

  public apply (f?: RawModuleField | ModuleField): void {
    if (!f) return

    Apply(this, f, CortezaID, 'fieldID')
    Apply(this, f, String, 'name', 'label', 'kind')
    Apply(this, f, Number, 'maxLength')
    Apply(this, f, Boolean, 'isRequired', 'isPrivate', 'isMulti', 'isSystem')

    if (f.defaultValue) {
      this.defaultValue = f.defaultValue
    }

    if (this.isSystem) {
      this.canUpdateRecordValue = true
      this.canReadRecordValue = true
    } else {
      Apply(this, f, Boolean, 'canUpdateRecordValue', 'canReadRecordValue')
    }

    if (IsOf(f, 'kind')) {
      this.kind = f.kind
    }

    if (IsOf(f, 'options')) {
      this.options = f.options
    }
  }

  public hasValidName (): boolean {
    return FieldNameValidator.test(this.name)
  }

  public isValid (): boolean {
    return this.hasValidName()
  }
}

export {
  FieldNameValidator,
  ModuleField,
}