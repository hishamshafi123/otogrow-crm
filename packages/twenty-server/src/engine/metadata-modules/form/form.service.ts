import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';

import { isNonEmptyString } from '@sniptt/guards';
import { isDefined } from 'twenty-shared/utils';
import { type Repository } from 'typeorm';
import { v4 } from 'uuid';

import {
  FORM_FIELD_KEYS,
  FORM_FIELD_TYPES,
  type FormFieldDefinition,
  type FormFieldKey,
  type FormFieldType,
} from 'src/engine/metadata-modules/form/constants/form-field-definition.constant';
import { type CreateFormInput } from 'src/engine/metadata-modules/form/dtos/create-form.input';
import { type UpdateFormInput } from 'src/engine/metadata-modules/form/dtos/update-form.input';
import { FormEntity } from 'src/engine/metadata-modules/form/entities/form.entity';

@Injectable()
export class FormService {
  constructor(
    @InjectRepository(FormEntity)
    private readonly formRepository: Repository<FormEntity>,
  ) {}

  async findAll(workspaceId: string): Promise<FormEntity[]> {
    return this.formRepository.find({
      where: { workspaceId },
      order: { createdAt: 'ASC' },
    });
  }

  async findById(id: string, workspaceId: string): Promise<FormEntity | null> {
    return this.formRepository.findOne({ where: { id, workspaceId } });
  }

  async findActiveByPublicId(publicId: string): Promise<FormEntity | null> {
    return this.formRepository.findOne({
      where: { publicId, isActive: true },
    });
  }

  async create(
    input: CreateFormInput,
    workspaceId: string,
  ): Promise<FormEntity> {
    const fields = this.validateFields(input.fields);

    return this.formRepository.save({
      name: input.name,
      fields,
      successMessage: input.successMessage ?? null,
      isActive: input.isActive ?? true,
      publicId: v4(),
      workspaceId,
    });
  }

  async update(
    input: UpdateFormInput,
    workspaceId: string,
  ): Promise<FormEntity> {
    const form = await this.formRepository.findOne({
      where: { id: input.id, workspaceId },
    });

    if (!isDefined(form)) {
      throw new NotFoundException('Form not found');
    }

    return this.formRepository.save({
      ...form,
      name: input.update.name ?? form.name,
      fields: isDefined(input.update.fields)
        ? this.validateFields(input.update.fields)
        : form.fields,
      successMessage:
        input.update.successMessage !== undefined
          ? input.update.successMessage
          : form.successMessage,
      isActive: input.update.isActive ?? form.isActive,
    });
  }

  async delete(id: string, workspaceId: string): Promise<FormEntity> {
    const form = await this.formRepository.findOne({
      where: { id, workspaceId },
    });

    if (!isDefined(form)) {
      throw new NotFoundException('Form not found');
    }

    return this.formRepository.softRemove(form);
  }

  private validateFields(
    fields: CreateFormInput['fields'],
  ): FormFieldDefinition[] {
    if (fields.length === 0) {
      throw new BadRequestException('A form needs at least one field');
    }

    return fields.map((field) => {
      if (!FORM_FIELD_KEYS.includes(field.key as FormFieldKey)) {
        throw new BadRequestException(
          `Unsupported form field key "${field.key}"`,
        );
      }

      if (!FORM_FIELD_TYPES.includes(field.type as FormFieldType)) {
        throw new BadRequestException(
          `Unsupported form field type "${field.type}"`,
        );
      }

      if (!isNonEmptyString(field.label)) {
        throw new BadRequestException(
          `Form field "${field.key}" needs a label`,
        );
      }

      return {
        key: field.key as FormFieldKey,
        label: field.label,
        type: field.type as FormFieldType,
        required: field.required,
      };
    });
  }
}
