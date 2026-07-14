import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import Text from '../Text';
import { TextVariants, TextWeights, TextColors } from '../../../types/typography';

describe('Text', () => {
  describe('基础渲染', () => {
    it('渲染 children 内容', () => {
      render(<Text>Hello World</Text>);
      expect(screen.getByText('Hello World')).toBeInTheDocument();
    });

    it('渲染多种类型的 children', () => {
      render(
        <Text>
          <span>嵌套元素</span>
          文本内容
        </Text>,
      );
      expect(screen.getByText('嵌套元素')).toBeInTheDocument();
      expect(screen.getByText('文本内容')).toBeInTheDocument();
    });

    it('使用默认 variant (body) 渲染', () => {
      render(<Text>Default Variant</Text>);
      const element = screen.getByText('Default Variant');
      expect(element.tagName).toBe('P');
      expect(element).toHaveClass('text-xs', 'sm:text-sm');
    });
  });

  describe('Variant 变体', () => {
    const variantTests = [
      { variant: 'displayLarge', tag: 'H1', size: 'text-3xl sm:text-4xl lg:text-5xl', weight: 'bold', color: 'primary', extraClasses: 'text-shadow-shiny mb-4' },
      { variant: 'display', tag: 'H1', size: 'text-2xl sm:text-3xl', weight: 'bold', color: 'primary', extraClasses: 'text-shadow-shiny' },
      { variant: 'headline', tag: 'H1', size: 'text-xl sm:text-2xl', weight: 'bold', color: 'primary', extraClasses: 'text-shadow-shiny' },
      { variant: 'title', tag: 'H2', size: 'text-lg sm:text-xl', weight: 'bold', color: 'primary', extraClasses: 'text-shadow-shiny' },
      { variant: 'heading', tag: 'H3', size: 'text-sm sm:text-base', weight: 'semibold', color: 'primary', extraClasses: undefined },
      { variant: 'body', tag: 'P', size: 'text-xs sm:text-sm', weight: 'normal', color: 'secondary', extraClasses: undefined },
      { variant: 'label', tag: 'SPAN', size: 'text-xs sm:text-sm', weight: 'medium', color: 'secondary', extraClasses: undefined },
      { variant: 'small', tag: 'P', size: 'text-[10px] sm:text-xs', weight: 'normal', color: 'secondary', extraClasses: undefined },
    ] as const;

    variantTests.forEach(({ variant, tag, size, weight, color, extraClasses }) => {
      describe(`${variant} variant`, () => {
        it(`渲染为正确的 HTML 元素 (${tag})`, () => {
          render(<Text variant={TextVariants[variant]}>{variant} text</Text>);
          const element = screen.getByText(`${variant} text`);
          expect(element.tagName).toBe(tag);
        });

        it(`应用正确的 size 类`, () => {
          render(<Text variant={TextVariants[variant]}>{variant} text</Text>);
          const element = screen.getByText(`${variant} text`);
          const sizeClasses = size.split(' ');
          sizeClasses.forEach((cls) => {
            expect(element.className).toContain(cls);
          });
        });

        it(`应用正确的默认 weight 类`, () => {
          render(<Text variant={TextVariants[variant]}>{variant} text</Text>);
          const element = screen.getByText(`${variant} text`);
          expect(element).toHaveClass(`font-${weight}`);
        });

        it(`应用正确的默认 color 类`, () => {
          render(<Text variant={TextVariants[variant]}>{variant} text</Text>);
          const element = screen.getByText(`${variant} text`);
          const colorMap: Record<string, string> = {
            primary: 'text-text-primary',
            secondary: 'text-text-secondary',
            accent: 'text-accent',
            button: 'text-button-text',
            info: 'text-blue-400',
            success: 'text-green-400',
            error: 'text-red-400',
            white: 'text-white',
          };
          expect(element).toHaveClass(colorMap[color]);
        });

        if (extraClasses) {
          it(`应用正确的 extraClasses`, () => {
            render(<Text variant={TextVariants[variant]}>{variant} text</Text>);
            const element = screen.getByText(`${variant} text`);
            const extraClassList = extraClasses.split(' ');
            extraClassList.forEach((cls) => {
              expect(element.className).toContain(cls);
            });
          });
        }
      });
    });
  });

  describe('Weight 字重', () => {
    it('自定义 weight 覆盖默认', () => {
      render(<Text weight={TextWeights.bold}>Bold Text</Text>);
      const element = screen.getByText('Bold Text');
      expect(element).toHaveClass('font-bold');
      expect(element).not.toHaveClass('font-normal');
    });

    it('所有 weight 值都能正确应用', () => {
      const weights = [
        { key: 'bold', cls: 'font-bold' },
        { key: 'semibold', cls: 'font-semibold' },
        { key: 'medium', cls: 'font-medium' },
        { key: 'normal', cls: 'font-normal' },
      ] as const;

      weights.forEach(({ key, cls }) => {
        const { unmount } = render(<Text weight={TextWeights[key]}>{key} weight</Text>);
        const element = screen.getByText(`${key} weight`);
        expect(element).toHaveClass(cls);
        unmount();
      });
    });

    it('weight 可以与 variant 组合使用', () => {
      render(
        <Text variant={TextVariants.title} weight={TextWeights.medium}>
          Title with medium weight
        </Text>,
      );
      const element = screen.getByText('Title with medium weight');
      expect(element).toHaveClass('font-medium');
      expect(element).not.toHaveClass('font-bold');
    });
  });

  describe('Color 颜色', () => {
    it('自定义 color 覆盖默认', () => {
      render(<Text color={TextColors.error}>Error Text</Text>);
      const element = screen.getByText('Error Text');
      expect(element).toHaveClass('text-red-400');
      expect(element).not.toHaveClass('text-text-secondary');
    });

    it('所有 color 值都能正确应用', () => {
      const colors = [
        { key: 'primary', cls: 'text-text-primary' },
        { key: 'secondary', cls: 'text-text-secondary' },
        { key: 'accent', cls: 'text-accent' },
        { key: 'button', cls: 'text-button-text' },
        { key: 'info', cls: 'text-blue-400' },
        { key: 'success', cls: 'text-green-400' },
        { key: 'error', cls: 'text-red-400' },
        { key: 'white', cls: 'text-white' },
      ] as const;

      colors.forEach(({ key, cls }) => {
        const { unmount } = render(<Text color={TextColors[key]}>{key} color</Text>);
        const element = screen.getByText(`${key} color`);
        expect(element).toHaveClass(cls);
        unmount();
      });
    });

    it('color 可以与 variant 组合使用', () => {
      render(
        <Text variant={TextVariants.title} color={TextColors.white}>
          Title with white color
        </Text>,
      );
      const element = screen.getByText('Title with white color');
      expect(element).toHaveClass('text-white');
      expect(element).not.toHaveClass('text-text-primary');
    });
  });

  describe('weight 和 color 组合', () => {
    it('同时自定义 weight 和 color', () => {
      render(
        <Text weight={TextWeights.semibold} color={TextColors.success}>
          Custom Text
        </Text>,
      );
      const element = screen.getByText('Custom Text');
      expect(element).toHaveClass('font-semibold');
      expect(element).toHaveClass('text-green-400');
    });
  });

  describe('as 属性', () => {
    it('as 属性可以自定义渲染元素', () => {
      render(<Text as="div">Div Text</Text>);
      const element = screen.getByText('Div Text');
      expect(element.tagName).toBe('DIV');
    });

    it('as 优先级高于 variant.defaultElement', () => {
      render(
        <Text variant={TextVariants.title} as="section">
          Section Text
        </Text>,
      );
      const element = screen.getByText('Section Text');
      expect(element.tagName).toBe('SECTION');
    });

    it('as 可以使用不同的 HTML 元素', () => {
      const elements = ['div', 'span', 'section', 'article', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'blockquote'];
      
      elements.forEach((tag) => {
        const { unmount } = render(<Text as={tag as any}>{tag} element</Text>);
        const element = screen.getByText(`${tag} element`);
        expect(element.tagName).toBe(tag.toUpperCase());
        unmount();
      });
    });
  });

  describe('className 合并', () => {
    it('自定义 className 会被合并', () => {
      render(<Text className="custom-class">Custom Class Text</Text>);
      const element = screen.getByText('Custom Class Text');
      expect(element).toHaveClass('custom-class');
    });

    it('多个自定义 className 会被合并', () => {
      render(<Text className="class-a class-b">Multi Class Text</Text>);
      const element = screen.getByText('Multi Class Text');
      expect(element).toHaveClass('class-a', 'class-b');
    });

    it('自定义 className 与 variant 类共存', () => {
      render(
        <Text variant={TextVariants.title} className="custom-title">
          Title with Custom Class
        </Text>,
      );
      const element = screen.getByText('Title with Custom Class');
      expect(element).toHaveClass('custom-title');
      expect(element).toHaveClass('text-lg', 'sm:text-xl');
    });

    it('自定义 className 与 weight、color 类共存', () => {
      render(
        <Text weight={TextWeights.bold} color={TextColors.error} className="custom-class">
          Styled Text
        </Text>,
      );
      const element = screen.getByText('Styled Text');
      expect(element).toHaveClass('custom-class');
      expect(element).toHaveClass('font-bold');
      expect(element).toHaveClass('text-red-400');
    });
  });

  describe('onClick 事件', () => {
    it('点击时调用 onClick 处理函数', () => {
      const handleClick = vi.fn();
      render(<Text onClick={handleClick}>Clickable Text</Text>);
      fireEvent.click(screen.getByText('Clickable Text'));
      expect(handleClick).toHaveBeenCalledTimes(1);
    });

    it('onClick 事件对象正确传递', () => {
      const handleClick = vi.fn();
      render(<Text onClick={handleClick}>Clickable Text</Text>);
      const element = screen.getByText('Clickable Text');
      fireEvent.click(element);
      expect(handleClick).toHaveBeenCalledWith(expect.any(Object));
      expect(handleClick.mock.calls[0][0].target).toBe(element);
    });

    it('与 variant 组合时 onClick 正常工作', () => {
      const handleClick = vi.fn();
      render(
        <Text variant={TextVariants.title} onClick={handleClick}>
          Clickable Title
        </Text>,
      );
      fireEvent.click(screen.getByText('Clickable Title'));
      expect(handleClick).toHaveBeenCalledTimes(1);
    });

    it('与 as 属性组合时 onClick 正常工作', () => {
      const handleClick = vi.fn();
      render(
        <Text as="button" onClick={handleClick}>
          Button Text
        </Text>,
      );
      fireEvent.click(screen.getByText('Button Text'));
      expect(handleClick).toHaveBeenCalledTimes(1);
    });
  });

  describe('其他事件处理', () => {
    it('支持 onMouseEnter 事件', () => {
      const handleMouseEnter = vi.fn();
      render(<Text onMouseEnter={handleMouseEnter}>Hover Text</Text>);
      fireEvent.mouseEnter(screen.getByText('Hover Text'));
      expect(handleMouseEnter).toHaveBeenCalledTimes(1);
    });

    it('支持 onMouseLeave 事件', () => {
      const handleMouseLeave = vi.fn();
      render(<Text onMouseLeave={handleMouseLeave}>Hover Text</Text>);
      fireEvent.mouseLeave(screen.getByText('Hover Text'));
      expect(handleMouseLeave).toHaveBeenCalledTimes(1);
    });
  });

  describe('ref 转发', () => {
    it('forwardRef 正确工作，可以获取到 DOM 元素', () => {
      const ref = React.createRef<HTMLElement>();
      render(<Text ref={ref}>Ref Text</Text>);
      expect(ref.current).not.toBeNull();
      expect(ref.current).toBeInstanceOf(HTMLElement);
      expect(ref.current?.textContent).toBe('Ref Text');
    });

    it('ref 指向正确的元素类型', () => {
      const ref = React.createRef<HTMLElement>();
      render(
        <Text variant={TextVariants.title} ref={ref}>
          Title Ref
        </Text>,
      );
      expect(ref.current).toBeInstanceOf(HTMLHeadingElement);
      expect(ref.current?.tagName).toBe('H2');
    });

    it('使用 as 属性时 ref 指向正确的元素', () => {
      const ref = React.createRef<HTMLElement>();
      render(
        <Text as="div" ref={ref}>
          Div Ref
        </Text>,
      );
      expect(ref.current).toBeInstanceOf(HTMLDivElement);
    });
  });

  describe('displayName', () => {
    it('Text.displayName 为 \'Text\'', () => {
      expect(Text.displayName).toBe('Text');
    });
  });

  describe('其他属性透传', () => {
    it('透传 id 属性', () => {
      render(<Text id="text-id">Text with ID</Text>);
      const element = screen.getByText('Text with ID');
      expect(element).toHaveAttribute('id', 'text-id');
    });

    it('透传 data-* 属性', () => {
      render(<Text data-testid="custom-text">Text with Data Attr</Text>);
      const element = screen.getByTestId('custom-text');
      expect(element).toBeInTheDocument();
    });

    it('透传 aria-* 属性', () => {
      render(<Text aria-label="custom label">Text with Aria</Text>);
      const element = screen.getByText('Text with Aria');
      expect(element).toHaveAttribute('aria-label', 'custom label');
    });

    it('透传 title 属性', () => {
      render(<Text title="Tooltip text">Text with Title</Text>);
      const element = screen.getByText('Text with Title');
      expect(element).toHaveAttribute('title', 'Tooltip text');
    });

    it('透传 style 属性', () => {
      render(<Text style={{ marginTop: '10px' }}>Styled Text</Text>);
      const element = screen.getByText('Styled Text');
      expect(element.style.marginTop).toBe('10px');
    });
  });
});
