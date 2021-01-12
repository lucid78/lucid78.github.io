
## **recvuntil**

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


다음에는 sendline() 함수를 추가해보도록 하자.
