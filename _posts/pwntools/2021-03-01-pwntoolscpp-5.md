---
title:  pwntools 개발기 (5)
excerpt: "ELF 클래스에 함수 추가하기"
search: true
categories: pwntools
tags: dev
toc: true
---

라이브러리로 작성된 완전한 코드는 아래에서 확인 가능하다.<br>
[https://github.com/lucid78/pwntoolscpp](https://github.com/lucid78/pwntoolscpp){: target="_blank"}
{: .notice--info}

## **got**

두 개의 소스를 관리하기가 힘들어서 지금부터는 라이브러리로 작성된 코드를 수정하며 이어가도록 한다.

지난 개발기에서 마지막으로 got() 함수를 추가했다. 사실 이 함수는 타겟 바이너리로부터 수집한 모든 symbol들의 정보를 조회하는 방식이라 got에 포함된 symbol들만을 가지고 있지는 않다.

실제 got의 정보는 .rel.plt section에 포함되어 있으며, 해당 section은 아래와 같이 3가지의 정보로 구성되어 있다.

+ symbol의 address
+ relocation type
+ symbol의 index


따라서 index 값으로 symbol 테이블에서 해당 함수의 이름을 구하여 got를 위한 자료구조에 저장하면 된다.

먼저 symbol table로부터 symbol의 정보를 수집하여, 구조체에 symbol의 index와 name을 저장한다. symbol의 index와 name을 저장하는 자료구조 symbols를 선언하고, symbol.get_symbol()에서 수집한 index와 name을 저장한다. 

```cpp
std::unordered_map<int, std::string> symbols;
for(ELFIO::Elf_Xword i = 0; i < symbol.get_symbols_num(); ++i)
{
    std::string name;
    ELFIO::Elf64_Addr value{0};
    ELFIO::Elf_Xword  size{0};
    unsigned char bind{0};
    unsigned char type{0};
    ELFIO::Elf_Half section{0};
    unsigned char other{0};
    symbol.get_symbol(i, name, value, size, bind, type, section, other);

    symbols.emplace(i, name);

    if(!name.empty())
    {
        m_symbols.emplace(name, value);
    }
}
```
<br>
다음으로 .rel.plt section의 data를 get_data() 함수를 호출하여 가져온다.이 data는 4바이트의 address, 1바이트의 relocation type, 3바이트의 index로 구성되어 있으니 각 크기에 맞게 읽어들인 후 m_got라는 자료구조에 저장한다.  

```cpp
const ELFIO::Elf_Xword MAX_DATA_ENTRIES{64};
std::unordered_map<std::string, ELFIO::Elf64_Addr> m_gots;
for(ELFIO::Elf_Half i{0}; i < reader.sections.size(); ++i)
{
    ELFIO::section* sec = reader.sections[i];
    if(!sec->get_name().compare(".rel.plt"))
    {
        if(const char* pdata{sec->get_data()}; pdata)
        {
            for(ELFIO::Elf_Xword j{0}; j < std::min(sec->get_size(), MAX_DATA_ENTRIES); j += 3)
            {
                int addr{0};
                memcpy(&addr, pdata + j, 4);
                j += 4;

                char type{0};
                memcpy(&type, pdata + j, 1);
                j+=1;

                char idx{0};
                memcpy(&idx, pdata + j, 1);

                if(const auto& it{symbols.find(int(idx))}; it != symbols.end())
                {
                    m_gots.emplace(it->second, addr);
                }
            }
        }
        break;
    }
}   // end of for
```

이제 got() 함수를 호출하면 m_gots에 저장된 정보를 반환하면 된다.

## **plt**

이번에는 pwntools의 ELF가 제공하는 plt() 함수를 구현해보자. 해당 함수는 plt의 정보를 출력하는 함수이다.<br>
먼저 .plt section으로부터 plt 주소를 구하는 데 필요한 정보를 아래와 같이 수집하자.

```cpp
ELFIO::Elf_Xword plt_entry_size{0};
ELFIO::Elf_Xword plt_vma_address{0};
for(ELFIO::Elf_Half i{0}; i < reader.sections.size(); ++i)
{
    ELFIO::section* sec = reader.sections[i];
    if(!sec->get_name().compare(".plt"))
    {
        plt_entry_size = sec->get_addr_align();
        plt_vma_address = sec->get_address();
        break;
    }
}
```
<br>
그리고 relocation 정보를 수집하는 loop에서 .plt section일 경우에, 위에서 구한 plt_entry_size와 plt_vma_address를 이용하여 자료구조에 저장하면 된다.
코드는 아래와 같다.

```cpp
for(ELFIO::Elf_Xword i = 0; i < reloc.get_entries_num(); ++i)
{
    ELFIO::Elf64_Addr offset{0};
    ELFIO::Elf_Xword info{0};
    ELFIO::Elf_Word symbol;
    ELFIO::Elf_Word type{0};
    std::string symbolName;
    reloc.get_entry(i, offset, info, symbol, type, symbolName);
    relocations.emplace(symbolName, offset);

    if(!sec->get_name().compare(".rel.plt"))
    {
        m_plts.emplace(symbolName, plt_vma_address + (i + 1) * plt_entry_size);
    }
}
```

이제 plt() 함수를 호출하면 m_plts에 저장된 정보를 반환하면 된다.


## **function**

이번에는 function을 구현해보자.<br>
pwntools에서 이 함수는 모든 함수의 주소와 이름, 그리고 크기를 출력해 주는 함수이다.

got를 구하는 함수에서 symbol의 type이 STT_FUNC 이고 size가 0이 아닐 경우 자료구조에 저장하면 된다.
<br>코드는 아래와 같다.

```cpp
if(static_cast<int>(type) == STT_FUNC && 0 != size)
{
    m_functions.emplace(name, FUNCTION{name, value, size});
}
```
<br>
아래는 완성된 소스를 출력한 결과이다.

![full](/assets/images/elf_add.png)

