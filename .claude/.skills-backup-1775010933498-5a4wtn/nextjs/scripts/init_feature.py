#!/usr/bin/env python3
"""
Initialize a feature module following coding standards.
Usage: python3 init_feature.py <feature-name> --path frontend/src/features
"""

import argparse
from pathlib import Path

FEATURE_STRUCTURE = ["components", "hooks", "api"]

TEMPLATES = {
    "types.ts": '''import type {{ BaseEntity }} from '@/lib/types';

export interface {PascalName} extends BaseEntity {{
  title: string;
  description: string;
}}

export interface {PascalName}FormData {{
  title: string;
  description: string;
}}
''',
    "api/{name}-api.ts": '''import {{ apiClient }} from '@/lib/api/client';
import type {{ {PascalName} }} from '../types';
import type {{ {PascalName}FormData }} from '../types';

export const {camelName}Api = {{
  getAll: () =>
    apiClient<{{ data: {PascalName}[] }}>("/{name}s"),

  getById: (id: string) =>
    apiClient<{{ data: {PascalName} }}>(
      `/{name}s/${{id}}?populate=*`
    ),

  create: (data: {PascalName}FormData) =>
    apiClient<{{ data: {PascalName} }}>("/{name}s", {{
      method: "POST",
      body: JSON.stringify({{ data }}),
    }}),

  update: (id: string, data: Partial<{PascalName}FormData>) =>
    apiClient<{{ data: {PascalName} }}>(
      `/{name}s/${{id}}`,
      {{
        method: "PUT",
        body: JSON.stringify({{ data }}),
      }}
    ),

  delete: (id: string) =>
    apiClient(`/{name}s/${{id}}`, {{ method: "DELETE" }}),
}};
''',
    "hooks/use-{name}s.ts": '''import {{ useQuery, useMutation, useQueryClient }} from '@tanstack/react-query';
import {{ {camelName}Api }} from '../api/{name}-api';

export function use{PascalName}s() {{
  return useQuery({{
    queryKey: ['{name}s'],
    queryFn: {camelName}Api.getAll,
  }});
}}

export function use{PascalName}(id: string) {{
  return useQuery({{
    queryKey: ['{name}s', id],
    queryFn: () => {camelName}Api.getById(id),
    enabled: !!id,
  }});
}}

export function useCreate{PascalName}() {{
  const queryClient = useQueryClient();

  return useMutation({{
    mutationFn: {camelName}Api.create,
    onSuccess: () => {{
      queryClient.invalidateQueries({{ queryKey: ['{name}s'] }});
    }},
  }});
}}
''',
    "components/{name}-card.tsx": ''''use client';

import {{ Card, CardContent, CardHeader, CardTitle }} from '@/components/ui/card';
import type {{ {PascalName} }} from '../types';

interface {PascalName}CardProps {{
  {camelName}: {PascalName};
  onClick?: () => void;
}}

export function {PascalName}Card({{ {camelName}, onClick }}: {PascalName}CardProps) {{
  return (
    <Card className="cursor-pointer hover:shadow-md" onClick={{onClick}}>
      <CardHeader>
        <CardTitle>{{{camelName}.title}}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">
          {{{camelName}.description}}
        </p>
      </CardContent>
    </Card>
  );
}}
'''
}


def to_pascal(name: str) -> str:
    return ''.join(word.capitalize() for word in name.replace('-', '_').split('_'))


def to_camel(name: str) -> str:
    pascal = to_pascal(name)
    return pascal[0].lower() + pascal[1:]


def main():
    parser = argparse.ArgumentParser(description='Initialize a feature module')
    parser.add_argument('name', help='Feature name (kebab-case)')
    parser.add_argument('--path', default='frontend/src/features', help='Features directory')
    args = parser.parse_args()

    name = args.name.lower().replace('_', '-')
    pascal_name = to_pascal(name)
    camel_name = to_camel(name)

    feature_path = Path(args.path) / name

    print(f"\n\U0001f680 Creating feature module: {name}\n")

    # Create directories
    for folder in FEATURE_STRUCTURE:
        (feature_path / folder).mkdir(parents=True, exist_ok=True)
        print(f"  Created: {feature_path / folder}")

    # Create files from templates
    print("\n\U0001f4c4 Creating files...")
    for file_template, content in TEMPLATES.items():
        file_name = file_template.format(name=name)
        file_path = feature_path / file_name

        file_content = content.format(
            name=name,
            PascalName=pascal_name,
            camelName=camel_name
        )

        file_path.parent.mkdir(parents=True, exist_ok=True)
        file_path.write_text(file_content)
        print(f"  Created: {file_path}")

    print(f"\n\u2705 Feature '{name}' created at {feature_path}")
    print(f"\nImport with:")
    print(f"  import {{ {pascal_name}Card }} from '@/features/{name}/components';")
    print(f"  import {{ use{pascal_name}s }} from '@/features/{name}/hooks';")


if __name__ == '__main__':
    main()
